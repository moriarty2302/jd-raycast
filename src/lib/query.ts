import type { Entry } from "./collect.ts";

// What the search box means. A leading number narrows by key ("11",
// "11.1", "10-19", "W0"); any words after it are matched fuzzily. With
// only a number the list stays in ID order; with words it is ranked.
export interface Query {
  scope?: string;
  words: string;
}

const SCOPE = /^(\d{1,2}(-\d{0,2})?|\d\d\.\d{0,2}(\+\S*)?|w\d{0,4})$/i;

export function parseQuery(text: string): Query {
  const trimmed = text.trim();
  if (!trimmed) return { words: "" };
  const [first, ...rest] = trimmed.split(/\s+/);
  if (SCOPE.test(first)) return { scope: first.toLowerCase(), words: rest.join(" ") };
  return { words: trimmed };
}

export function inScope(e: Entry, scope: string): boolean {
  const key = e.key.toLowerCase();
  // "10-19" or "10-": everything in that area, i.e. keys whose first digit matches.
  const area = scope.match(/^(\d)\d-/);
  if (area) return /^\d/.test(key) && key[0] === area[1];
  if (key.startsWith(scope)) return true;
  // "34.11" also finds the work packages that belong to 34.11.
  return scope.includes(".") && !!e.wpFor && e.wpFor.startsWith(scope);
}

// Headers and standard zeros are structure, not destinations: rank them
// below real IDs when matching words.
const KIND_PENALTY: Partial<Record<Entry["kind"], number>> = { header: 0.15, zero: 0.2 };

export function search(entries: Entry[], text: string, limit = 200): Entry[] {
  const q = parseQuery(text);
  const pool = q.scope ? entries.filter((e) => inScope(e, q.scope!)) : entries;
  if (!q.words) return [...pool].sort(byJdOrder);

  // Plain matches first: every word appears somewhere. Only when nothing
  // matches that way fall back to fuzzy, which is what catches typos
  // without flooding ordinary searches with near-misses.
  const words = q.words.toLowerCase().split(/\s+/).filter(Boolean);
  const exact = pool
    .map((e) => ({ e, s: wordScore(e, words) }))
    .filter((r): r is { e: Entry; s: number } => r.s !== null);
  const ranked = exact.length ? exact : fuzzy(pool, q.words);
  return ranked
    .map((r) => ({ e: r.e, s: r.s + (KIND_PENALTY[r.e.kind] ?? 0) }))
    .sort((a, b) => a.s - b.s || byJdOrder(a.e, b.e))
    .slice(0, limit)
    .map((r) => r.e);
}

// Lower is better. Each word costs its best field: title or key 0, alias
// 0.05, description 0.3, plus 0.1 when it starts mid-word ("tax" in
// "Syntax"). Null when a word matches nowhere.
function wordScore(e: Entry, words: string[]): number | null {
  const fields: Array<[string, number]> = [
    [e.title.toLowerCase(), 0],
    [e.key.toLowerCase(), 0],
    ...e.aliases.map((a): [string, number] => [a.toLowerCase(), 0.05]),
    [(e.description ?? "").toLowerCase(), 0.3],
  ];
  let total = 0;
  for (const w of words) {
    let best: number | null = null;
    for (const [text, base] of fields) {
      const i = text.indexOf(w);
      if (i < 0) continue;
      const cost = base + (i === 0 || /[^\p{L}\p{N}]/u.test(text[i - 1]) ? 0 : 0.1);
      if (best === null || cost < best) best = cost;
    }
    if (best === null) return null;
    total += best;
  }
  return total / words.length;
}

// Typo matching: each query word must be within a small edit distance of
// some word in the title or aliases (or of its start, so "pasp" works while
// typing). One edit allowed for 4-5 letters, two for longer; shorter words
// must match plainly. A different first letter costs extra, which keeps
// "pasport" on Passports rather than Sport.
function fuzzy(pool: Entry[], text: string): Array<{ e: Entry; s: number }> {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const out: Array<{ e: Entry; s: number }> = [];
  for (const e of pool) {
    const tokens = [e.title, ...e.aliases]
      .join(" ")
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean);
    let total = 0;
    let ok = true;
    for (const w of words) {
      const allowed = w.length >= 6 ? 2 : w.length >= 4 ? 1 : 0;
      let best: number | null = null;
      for (const t of tokens) {
        if (t.includes(w)) {
          best = 0;
          break;
        }
        if (!allowed) continue;
        const d = Math.min(editDistance(w, t), editDistance(w, t.slice(0, w.length)));
        if (d > allowed) continue;
        const cost = d / w.length + (t[0] === w[0] ? 0 : 0.2);
        if (best === null || cost < best) best = cost;
      }
      if (best === null) {
        ok = false;
        break;
      }
      total += best;
    }
    if (ok) out.push({ e, s: 0.5 + total / words.length });
  }
  return out;
}

// Optimal string alignment distance: insertions, deletions, substitutions
// and swaps of two neighbouring letters each count as one edit.
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

export function byJdOrder(a: Entry, b: Entry): number {
  if (a.sortKey !== b.sortKey) return a.sortKey < b.sortKey ? -1 : 1;
  return a.sys < b.sys ? -1 : a.sys > b.sys ? 1 : 0;
}

// "14.22+ Claude" is keyed by its description; show just "14.22+".
export function displayKey(e: Entry): string {
  return e.kind === "extend" && e.key.includes("+ ") ? e.key.slice(0, e.key.indexOf(" ")) : e.key;
}

export function entryId(e: Entry): string {
  return `${e.sys}|${e.key}`;
}
