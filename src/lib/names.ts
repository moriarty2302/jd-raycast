// Reading a Johnny.Decimal name: "11.12 Passports", "11.16+ABC Legal…",
// "14.22+ Claude", "11.10 ■ Personal records 🗂", "W0010~34.11 A title @complete".
// Pure functions, no I/O, so they can be tested on their own.

export type Kind = "area" | "category" | "header" | "zero" | "id" | "extend" | "wp";

export interface ParsedName {
  key: string;
  title: string;
  kind: Kind;
  // For a work package: the ID it belongs to (the part after "~").
  wpFor?: string;
  // For a work package folder on the filesystem: its "@complete"-style tag.
  status?: string;
}

const AREA = /^(\d\d-\d\d)\s+(.+)$/;
const CATEGORY = /^(\d\d)\s+(.+)$/;
const EXTEND_SUFFIX = /^(\d\d\.\d\d)\+([A-Za-z0-9]+)\s+(.+)$/;
const EXTEND_DESC = /^(\d\d\.\d\d)\+\s+(.+)$/;
const ID = /^(\d\d\.\d\d)\s+(.+)$/;
const WP = /^(W\d{4})(?:~(\d\d\.\d\d))?\s+(.+)$/;
const WP_CONTAINER = /^W\d{4}-W\d{4}\s/;
// Header markers seen in the wild: ■ and ◾.
const HEADER_GLYPHS = /^[■◾▪◼□▫]️?\s*/;
const STATUS_TAG = /\s+@([\w-]+)$/;

export function parseName(name: string): ParsedName | null {
  let m: RegExpMatchArray | null;

  if ((m = name.match(AREA))) return { key: m[1], title: m[2], kind: "area" };
  if ((m = name.match(CATEGORY))) return { key: m[1], title: m[2], kind: "category" };
  if ((m = name.match(EXTEND_SUFFIX))) return { key: `${m[1]}+${m[2]}`, title: m[3], kind: "extend" };
  // For an "AC.ID+ Description" extend the description is the extension,
  // so it is part of the key (that is how jd and the vault address it).
  if ((m = name.match(EXTEND_DESC))) return { key: `${m[1]}+ ${m[2]}`, title: m[2], kind: "extend" };
  if ((m = name.match(ID))) {
    const id = m[1];
    const title = m[2].replace(HEADER_GLYPHS, "");
    return { key: id, title, kind: idKind(id, m[2]) };
  }
  if ((m = name.match(WP))) {
    let title = m[3];
    let status: string | undefined;
    const s = title.match(STATUS_TAG);
    if (s) {
      status = s[1];
      title = title.slice(0, s.index);
    }
    return { key: m[1], title, kind: "wp", wpFor: m[2], status };
  }
  return null;
}

// A filesystem "+" subfolder inside its base ID's folder: "+ABC Legal…" or "+ Kitchen renovation".
export function parseExtendFolder(baseId: string, name: string): ParsedName | null {
  let m: RegExpMatchArray | null;
  if ((m = name.match(/^\+([A-Za-z0-9]+)\s+(.+)$/))) return { key: `${baseId}+${m[1]}`, title: m[2], kind: "extend" };
  if ((m = name.match(/^\+\s+(.+)$/))) return { key: `${baseId}+ ${m[1]}`, title: m[1], kind: "extend" };
  return null;
}

export function isWpContainer(name: string): boolean {
  return WP_CONTAINER.test(name);
}

function idKind(id: string, rawTitle: string): Kind {
  const n = id.slice(3);
  if (n[0] === "0") return "zero";
  if (n[1] === "0" || HEADER_GLYPHS.test(rawTitle)) return "header";
  return "id";
}

// A string that sorts every kind into JD order with a plain comparison:
// 10-19, 10, 10.00 … 10.12, 10.12+X, 10.13 … 11, 11.00 … W0001 …
// Area → "10", category → "10!" ("!" sorts before "."), the rest as is.
export function sortKey(key: string, kind: Kind): string {
  if (kind === "area") return key.slice(0, 2);
  if (kind === "category") return `${key}!`;
  return key;
}
