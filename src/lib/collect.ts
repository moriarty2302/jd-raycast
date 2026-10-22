import fs from "node:fs";
import path from "node:path";
import type { JdSystem } from "./config.ts";
import { type Kind, isWpContainer, parseExtendFolder, parseName, sortKey } from "./names.ts";

// One row in the search: an area, category, ID, extend or work package,
// with whatever the vault and the filesystem each know about it.
export interface Entry {
  sys: string;
  key: string;
  title: string;
  kind: Kind;
  sortKey: string;
  description?: string;
  aliases: string[];
  notePath?: string;
  folderPath?: string;
  wpFor?: string;
  status?: string;
}

export interface CollectResult {
  entries: Entry[];
  // Same key found twice on one side, e.g. two notes both claiming 11.12.
  duplicates: Array<{ sys: string; key: string; paths: string[] }>;
  errors: Array<{ sys: string; where: string; message: string }>;
}

const NOTE_HEAD_BYTES = 4096;

export function collectAll(systems: JdSystem[]): CollectResult {
  const result: CollectResult = { entries: [], duplicates: [], errors: [] };
  for (const system of systems) {
    const one = collectSystem(system);
    result.entries.push(...one.entries);
    result.duplicates.push(...one.duplicates);
    result.errors.push(...one.errors);
  }
  return result;
}

export function collectSystem(system: JdSystem): CollectResult {
  const rows = new Map<string, Entry>();
  const seen = new Map<string, string[]>();
  const errors: CollectResult["errors"] = [];

  const row = (p: { key: string; title: string; kind: Kind; wpFor?: string; status?: string }): Entry => {
    let e = rows.get(p.key);
    if (!e) {
      e = { sys: system.sys, key: p.key, title: p.title, kind: p.kind, sortKey: sortKey(p.key, p.kind), aliases: [] };
      rows.set(p.key, e);
    }
    if (p.wpFor && !e.wpFor) e.wpFor = p.wpFor;
    if (p.status && !e.status) e.status = p.status;
    return e;
  };

  const note = (key: string, file: string) => {
    const paths = seen.get(`note|${key}`) ?? [];
    paths.push(file);
    seen.set(`note|${key}`, paths);
  };

  const list = (dir: string): fs.Dirent[] => {
    try {
      // withFileTypes avoids a stat per entry, which matters on cloud-synced folders.
      return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => !d.name.startsWith("."));
    } catch (e) {
      errors.push({ sys: system.sys, where: dir, message: String(e) });
      return [];
    }
  };

  // Vault: area/category folders, then ID notes. An ID note is either a
  // folder note (folder and note share a name) or a loose note directly in
  // the category, which is what `jd new id` leaves behind.
  const addNote = (file: string, parentAllowsLoose: boolean) => {
    const base = path.basename(file, ".md");
    const parsed = parseName(base);
    if (!parsed || parsed.kind === "area" || parsed.kind === "category") return;
    const isFolderNote = path.basename(path.dirname(file)) === base;
    if (!isFolderNote && !parentAllowsLoose) return;
    const e = row(parsed);
    e.title = parsed.title;
    note(parsed.key, file);
    if (!e.notePath) {
      e.notePath = file;
      readNoteHead(file, e);
    }
  };

  const vaultIdLevel = (dir: string) => {
    for (const d of list(dir)) {
      const full = path.join(dir, d.name);
      if (d.isFile() && d.name.endsWith(".md")) addNote(full, true);
      else if (d.isDirectory() && parseName(d.name)) {
        const inner = path.join(full, `${d.name}.md`);
        if (fs.existsSync(inner)) addNote(inner, false);
      }
    }
  };

  const jdex = system.jdex;
  // A system with no vault is filesystem only.
  if (jdex) {
    // A flat JDex keeps its notes in the vault root rather than in area and
    // category folders, so ID notes there count too.
    vaultIdLevel(jdex);
  }

  for (const a of jdex ? list(jdex) : []) {
    if (!a.isDirectory()) continue;
    const areaDir = path.join(jdex!, a.name);
    if (isWpContainer(a.name)) {
      vaultIdLevel(areaDir);
      continue;
    }
    const area = parseName(a.name);
    if (area?.kind !== "area") continue;
    row(area);
    for (const c of list(areaDir)) {
      if (!c.isDirectory()) continue;
      const cat = parseName(c.name);
      if (cat?.kind !== "category") continue;
      row(cat);
      vaultIdLevel(path.join(areaDir, c.name));
    }
  }

  // Filesystem: area/category/ID folders, "+" subfolders inside an ID, and
  // the work-package container.
  const folder = (key: string, dir: string) => {
    const e = rows.get(key);
    if (e && !e.folderPath) e.folderPath = dir;
    const paths = seen.get(`folder|${key}`) ?? [];
    paths.push(dir);
    seen.set(`folder|${key}`, paths);
  };

  for (const a of list(system.root)) {
    if (!a.isDirectory()) continue;
    const areaDir = path.join(system.root, a.name);
    if (isWpContainer(a.name)) {
      for (const w of list(areaDir)) {
        const wp = w.isDirectory() ? parseName(w.name) : null;
        if (!wp || wp.kind === "area" || wp.kind === "category") continue;
        row(wp);
        folder(wp.key, path.join(areaDir, w.name));
      }
      continue;
    }
    const area = parseName(a.name);
    if (area?.kind !== "area") continue;
    row(area);
    folder(area.key, areaDir);
    for (const c of list(areaDir)) {
      const cat = c.isDirectory() ? parseName(c.name) : null;
      if (cat?.kind !== "category") continue;
      const catDir = path.join(areaDir, c.name);
      row(cat);
      folder(cat.key, catDir);
      for (const i of list(catDir)) {
        const id = i.isDirectory() ? parseName(i.name) : null;
        if (!id || id.kind === "area" || id.kind === "category") continue;
        const idDir = path.join(catDir, i.name);
        row(id);
        folder(id.key, idDir);
        for (const x of list(idDir)) {
          const ext = x.isDirectory() ? parseExtendFolder(id.key, x.name) : null;
          if (!ext) continue;
          row(ext);
          folder(ext.key, path.join(idDir, x.name));
        }
      }
    }
  }

  // An area or category has no note of its own; point it at its JDex
  // zero (10-19 → 10.00, 11 → 11.00) so Enter still opens something useful.
  for (const e of rows.values()) {
    if (e.kind !== "area" && e.kind !== "category") continue;
    const zero = rows.get(`${e.key.slice(0, 2)}.00`);
    if (zero?.notePath) e.notePath = zero.notePath;
  }

  const duplicates: CollectResult["duplicates"] = [];
  for (const [k, paths] of seen) {
    if (paths.length > 1) duplicates.push({ sys: system.sys, key: k.split("|")[1], paths });
  }

  const entries = [...rows.values()].sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
  return { entries, duplicates, errors };
}

// Pull aliases and the description from the top of an ID note. Handles the
// current note format and an older one ("> This ID is about…",
// ">Location:" lines).
export function readNoteHead(file: string, e: Entry): void {
  let text: string;
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(NOTE_HEAD_BYTES);
    const n = fs.readSync(fd, buf, 0, NOTE_HEAD_BYTES, 0);
    fs.closeSync(fd);
    text = buf.subarray(0, n).toString("utf-8");
  } catch {
    return;
  }
  const parsed = parseNoteHead(text);
  e.aliases = parsed.aliases;
  if (parsed.description) e.description = parsed.description;
  if (!e.status && parsed.status) e.status = parsed.status;
}

export function parseNoteHead(text: string): { aliases: string[]; description?: string; status?: string } {
  const lines = text.split(/\r?\n/);
  let i = 0;
  const aliases: string[] = [];
  let status: string | undefined;

  if (lines[0]?.trim() === "---") {
    i = 1;
    let inAliases = false;
    for (; i < lines.length && lines[i].trim() !== "---"; i++) {
      const line = lines[i];
      const inline = line.match(/^aliases:\s*\[(.*)\]\s*$/);
      if (inline) {
        aliases.push(...splitInlineList(inline[1]));
        inAliases = false;
        continue;
      }
      if (/^aliases:\s*$/.test(line)) {
        inAliases = true;
        continue;
      }
      const item = line.match(/^\s+-\s+(.+)$/);
      if (inAliases && item) {
        aliases.push(unquote(item[1]));
        continue;
      }
      inAliases = false;
      const st = line.match(/^status:\s*(\S+)/);
      if (st) status = unquote(st[1]);
    }
    i++;
  }

  let description: string | undefined;
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^>\s*(.*)$/);
    if (!m) continue;
    const t = m[1].trim();
    if (!t || /^location:/i.test(t) || /^this id is about…?$/i.test(t) || /^\[!/.test(t)) continue;
    description = t;
    break;
  }
  return { aliases: aliases.filter(Boolean), description, status };
}

function splitInlineList(s: string): string[] {
  const out: string[] = [];
  const re = /\s*(?:"((?:[^"\\]|\\.)*)"|'([^']*)'|([^,]+))\s*,?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) out.push((m[1] ?? m[2] ?? m[3]).trim());
  return out;
}

function unquote(s: string): string {
  return s.trim().replace(/^["'](.*)["']$/, "$1");
}
