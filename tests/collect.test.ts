import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { collectSystem } from "../src/lib/collect.ts";
import { readSystems } from "../src/lib/config.ts";

// Build a throwaway system on disk: paths ending in "/" are folders,
// anything else is a file with the given text.
const made: string[] = [];
process.on("exit", () => made.forEach((d) => fs.rmSync(d, { recursive: true, force: true })));

function tree(spec: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jd-raycast-"));
  made.push(root);
  for (const [rel, text] of Object.entries(spec)) {
    const full = path.join(root, rel);
    if (rel.endsWith("/")) fs.mkdirSync(full, { recursive: true });
    else {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, text);
    }
  }
  return root;
}

const FILESYSTEM = {
  "fs/10-19 Life admin/11 Me/11.12 Passports/": "",
  "fs/10-19 Life admin/11 Me/11.16 Legal/+ABC Legal/": "",
  "fs/10-19 Life admin/12 Home/12.24 Renovations/": "",
};

test("a system with no jdex is read from the filesystem alone", () => {
  const root = tree(FILESYSTEM);
  const { entries } = collectSystem({ sys: "P76", name: "P76", root: path.join(root, "fs"), workPackages: false });
  const keys = entries.map((e) => e.key);
  assert.deepEqual(keys, ["10-19", "11", "11.12", "11.16", "11.16+ABC", "12", "12.24"]);
  assert.ok(entries.every((e) => e.folderPath && !e.notePath));
});

test("a flat JDex: notes in the vault root are matched to their folders", () => {
  const root = tree({
    ...FILESYSTEM,
    "vault/11.12 Passports.md": '---\naliases: ["Passports"]\n---\n> Passports and visas.\n',
    "vault/11.16+ABC Legal.md": "> Legal papers.\n",
    "vault/12.24 Renovations.md": "",
    "vault/Daily note.md": "",
  });
  const { entries } = collectSystem({
    sys: "F01",
    name: "F01",
    root: path.join(root, "fs"),
    jdex: path.join(root, "vault"),
    workPackages: false,
  });
  const byKey = new Map(entries.map((e) => [e.key, e]));
  assert.equal(byKey.get("11.12")?.description, "Passports and visas.");
  assert.deepEqual(byKey.get("11.12")?.aliases, ["Passports"]);
  assert.ok(byKey.get("11.12")?.folderPath && byKey.get("11.12")?.notePath);
  assert.equal(byKey.get("11.16+ABC")?.description, "Legal papers.");
  assert.ok(byKey.get("12.24")?.notePath);
  // Areas and categories come from the filesystem in a flat JDex.
  assert.ok(byKey.get("11")?.folderPath);
  assert.equal(entries.length, 7);
});

test("jd config: jdex is optional, and title is accepted for the name", () => {
  const root = tree({
    "config.json": JSON.stringify({
      systems: [
        {
          sys: "D25",
          title: "My business system",
          root: "/x/D25",
          jdex: "/x/D25 JDex",
          default: true,
          workPackages: { notes: { adapter: "obsidian" } },
        },
        { sys: "P76", title: "My personal system", root: "/x/P76" },
        { sys: "BAD" },
      ],
    }),
  });
  const systems = readSystems(path.join(root, "config.json"));
  assert.deepEqual(
    systems.map((s) => [s.sys, s.name, s.jdex ?? null, s.workPackages]),
    [
      ["D25", "My business system", "/x/D25 JDex", true],
      ["P76", "My personal system", null, false],
    ],
  );
});

test("config path: setting wins, then jd paths, then jd's default", async () => {
  const { resolveConfigPath, DEFAULT_CONFIG_PATH } = await import("../src/lib/config.ts");
  const ask = async () => ({ config: "/from/jd/config.json" });
  assert.deepEqual(await resolveConfigPath({ setting: "/mine.json", jd: "/bin/jd", ask }), {
    path: "/mine.json",
    source: "setting",
  });
  assert.deepEqual(await resolveConfigPath({ jd: "/bin/jd", ask }), { path: "/from/jd/config.json", source: "jd" });
  assert.deepEqual(await resolveConfigPath({ jd: null, ask }), { path: DEFAULT_CONFIG_PATH, source: "default" });
  const fails = async () => ({ ok: false as const });
  assert.deepEqual(await resolveConfigPath({ jd: "/bin/jd", ask: fails }), {
    path: DEFAULT_CONFIG_PATH,
    source: "default",
  });
});
