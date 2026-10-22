import fs from "node:fs";
import path from "node:path";
import type { Entry } from "./collect.ts";
import type { NewWpOk, ToFill } from "./jd.ts";
import { byJdOrder } from "./query.ts";

// The pieces of the New Work Package command that don't need Raycast:
// which IDs can be a parent, the template's fields as form fields, and the
// text of the preview and result screens.

// jd takes a plain AC.ID as a work package's parent ("21.25"), not an
// extend, a header or a standard zero.
export function wpParents(entries: Entry[], sys: string): Entry[] {
  return entries.filter((e) => e.sys === sys && e.kind === "id").sort(byJdOrder);
}

export interface FormField {
  id: string;
  flag: string;
  label: string;
  placeholder: string;
  // What the token's template line starts with ("- ", "> "), repeated on
  // each extra line of a multi-line answer.
  prefix: string;
  // A list line in the template ("- ", "1. ", "> - ") gets a multi-line box,
  // one item per line. Anything else is one line.
  multiline: boolean;
}

// The template decides: a list marker in front of the token means a list.
export function isListPrefix(prefix: string): boolean {
  return /(?:^|\s)(?:[-*+]|\d+\.)\s+$/.test(prefix);
}

// The list or quote markers in front of each {{?TOKEN}} in a template:
// "- {{?SCOPE …}}" → SCOPE: "- ", "> {{?OUTCOME …}}" → OUTCOME: "> ".
// Other text in front ("Owner: ") is not repeated.
export function templatePrefixes(template: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of template.split(/\r?\n/)) {
    const m = line.match(/^(.*?)\{\{\?([A-Z][A-Z0-9_]*)/);
    if (!m || m[2] in out) continue;
    const marker = m[1].match(/^\s*(?:(?:[-*+]|\d+\.|>)\s+)+/);
    out[m[2]] = marker ? marker[0] : "";
  }
  return out;
}

// One optional form field per template token: OUTCOME → "Outcome",
// placeholder = the template's brief.
export function formFields(toFill: ToFill[], prefixes: Record<string, string> = {}): FormField[] {
  return toFill.map((t) => ({
    id: `field${t.flag}`,
    flag: t.flag,
    label: t.token
      .toLowerCase()
      .split("_")
      .map((w, i) => (i === 0 ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" "),
    placeholder: t.brief,
    prefix: prefixes[t.token] ?? "",
    multiline: isListPrefix(prefixes[t.token] ?? ""),
  }));
}

// A multi-line answer, one point per line, with the template line's marker
// on every line after the first (jd adds it to the first). A line that
// already starts with the marker keeps just the one. Blank lines are
// dropped.
export function continueLines(value: string, prefix: string): string {
  const marker = prefix.trim();
  const lines = value
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (marker && l.startsWith(marker) ? l.slice(marker.length).trimStart() : l));
  return lines.join(`\n${prefix}`);
}

export function fieldValues(values: Record<string, unknown>, fields: FormField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = values[f.id];
    if (typeof v !== "string" || !v.trim()) continue;
    out[f.flag] = f.multiline ? continueLines(v, f.prefix) : v.replace(/\s*[\r\n]+\s*/g, " ").trim();
  }
  return out;
}

export interface WpInput {
  parent?: string;
  title?: string;
}

export function validate(input: WpInput, parents: Entry[]): { parent?: string; title?: string } {
  const errors: { parent?: string; title?: string } = {};
  if (!input.parent) errors.parent = "Choose the ID this work package belongs to";
  else if (!parents.some((p) => p.key === input.parent)) errors.parent = `${input.parent} is not an ID in this system`;
  if (!input.title?.trim()) errors.title = "Give it a title";
  return errors;
}

const WARNINGS: Record<string, string> = {
  tasks_refresh_failed:
    "The Things template couldn't be refreshed, so jd used its saved snapshot. If you've changed the template in Things, check Raycast's \"Data shared by Things\" permission, or run `jd new wp --refresh` in Terminal.",
  no_template: "There is no work package template, so the note is blank.",
};

export function warningText(code: string): string {
  return WARNINGS[code] ?? `jd warned: \`${code}\``;
}

// The preview: what jd says it will make, before anything is made.
export function previewMarkdown(r: NewWpOk, opts: { tasks: boolean; adapter?: string }): string {
  const lines = [
    `# ${r.name}`,
    "",
    "Nothing has been made yet. **Create** makes:",
    "",
    `- **Note** — \`${r.note}\``,
    `- **Folder** — \`${r.folder}\``,
    opts.adapter
      ? opts.tasks
        ? `- **${cap(opts.adapter)} project** — from the template project`
        : `- **${cap(opts.adapter)} project** — skipped`
      : "",
  ].filter((l, i, a) => l !== "" || a[i - 1] !== "");
  if (r.template) lines.push("", `Template: \`${r.template}\``);
  if (r.toFill.length) {
    lines.push("", "Left as the template's prompt text:", "");
    for (const t of r.toFill) lines.push(`- ${t.token.toLowerCase()} — *${t.brief}*`);
  }
  for (const w of r.warnings) lines.push("", `> ${warningText(w)}`);
  return lines.join("\n");
}

// After jd has made it.
export function resultMarkdown(r: NewWpOk, extra: string[] = []): string {
  const lines = [`# ✓ ${r.name}`, "", `- **Note** — \`${r.note}\``, `- **Folder** — \`${r.folder}\``];
  if (r.tasksUrl) lines.push(`- **Task project** — ${r.tasksUrl}`);
  for (const x of extra) lines.push("", x);
  for (const w of r.warnings) lines.push("", `> ${warningText(w)}`);
  return lines.join("\n");
}

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export interface WrapResult {
  path: string;
  wrapped: boolean;
  note?: string;
}

// Folder notes: move a bare "W0033~21.25 Title.md" that jd made into a
// folder of the same name, "W0033~21.25 Title/W0033~21.25 Title.md".
// Never overwrites: if the target note already exists, nothing moves.
// A note already inside its own folder is left alone.
export function wrapNote(notePath: string): WrapResult {
  const dir = path.dirname(notePath);
  const name = path.basename(notePath, ".md");
  if (path.basename(dir) === name) return { path: notePath, wrapped: false, note: "already in its folder" };
  if (!fs.existsSync(notePath)) return { path: notePath, wrapped: false, note: "note not found" };
  const folder = path.join(dir, name);
  const target = path.join(folder, `${name}.md`);
  if (fs.existsSync(target)) return { path: notePath, wrapped: false, note: `${target} already exists` };
  fs.mkdirSync(folder, { recursive: true });
  fs.renameSync(notePath, target);
  return { path: target, wrapped: true };
}
