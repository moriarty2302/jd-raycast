import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { findJd, jdEnv, jdPaths, newWp, newWpArgs } from "../src/lib/jd.ts";

// A fake jd: records its arguments and prints the JSON in $FAKE_JD_OUT,
// exiting with $FAKE_JD_EXIT. Never touches a real system.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jd-raycast-fakejd-"));
process.on("exit", () => fs.rmSync(dir, { recursive: true, force: true }));
const fake = path.join(dir, "jd");
const argsFile = path.join(dir, "args.json");
fs.writeFileSync(
  fake,
  `#!/usr/bin/env node
require("fs").writeFileSync(${JSON.stringify(argsFile)}, JSON.stringify(process.argv.slice(2)));
process.stdout.write(process.env.FAKE_JD_OUT || "");
process.stderr.write(process.env.FAKE_JD_ERR || "");
process.exit(Number(process.env.FAKE_JD_EXIT || 0));
`,
  { mode: 0o755 },
);

function fakeSays(out: unknown, exit = 0, err = "") {
  process.env.FAKE_JD_OUT = typeof out === "string" ? out : JSON.stringify(out);
  process.env.FAKE_JD_EXIT = String(exit);
  process.env.FAKE_JD_ERR = err;
}
const lastArgs = (): string[] => JSON.parse(fs.readFileSync(argsFile, "utf-8"));

test("arguments: one title argument, --flag=value fields keeping line breaks, empty fields left out", () => {
  assert.deepEqual(
    newWpArgs({
      sys: "D25",
      id: "21.25",
      title: "Draft the API FAQ",
      fields: { "--outcome": "An FAQ\non the wiki", "--scope": "", "--deliverable": "-- a page" },
      tasks: false,
      dryRun: true,
    }),
    [
      "--system",
      "D25",
      "new",
      "wp",
      "21.25",
      "Draft the API FAQ",
      "--outcome=An FAQ\non the wiki",
      "--deliverable=-- a page",
      "--no-tasks",
      "--dry-run",
      "--json",
    ],
  );
  assert.throws(() => newWpArgs({ sys: "D25", id: "21.25", title: "x", fields: { "rm -rf": "y" } }));
});

test("PATH gets Homebrew and the system folders first, without duplicates", () => {
  const p = jdEnv({ PATH: "/usr/bin:/custom" }).PATH!.split(":");
  assert.equal(p[0], "/opt/homebrew/bin");
  assert.ok(p.includes("/custom"));
  assert.equal(p.filter((x) => x === "/usr/bin").length, 1);
});

test("findJd: configured path if it runs, else none when nothing is there", () => {
  assert.equal(findJd(fake), fake);
  const missing = path.join(dir, "nope");
  const found = findJd(missing);
  assert.notEqual(found, missing);
});

test("a dry run is passed through as jd's own answer", async () => {
  fakeSays({
    ok: true,
    sys: "D25",
    num: "W0033",
    id: "21.25",
    title: "Draft the API FAQ",
    name: "W0033~21.25 Draft the API FAQ",
    note: "/v/W0033~21.25 Draft the API FAQ.md",
    folder: "/f/W0033~21.25 Draft the API FAQ",
    toFill: [{ token: "SCOPE", brief: "What's in and out", flag: "--scope" }],
    warnings: [],
    dryRun: true,
  });
  const r = await newWp(fake, { sys: "D25", id: "21.25", title: "Draft the API FAQ", dryRun: true });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.num, "W0033");
    assert.equal(r.toFill[0].flag, "--scope");
  }
  assert.deepEqual(lastArgs().slice(-2), ["--dry-run", "--json"]);
});

test("jd's refusal comes back with its code", async () => {
  fakeSays({ ok: false, code: "folder_exists", message: "W0033 is not in the JDex, but…", path: "/f/W0033" }, 1);
  const r = await newWp(fake, { sys: "D25", id: "21.25", title: "x" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, "folder_exists");
    assert.equal(r.path, "/f/W0033");
  }
});

test("no JSON at all becomes bad_output with jd's stderr", async () => {
  fakeSays("", 2, "jq: command not found\n");
  const r = await newWp(fake, { sys: "D25", id: "21.25", title: "x" });
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.code, "bad_output");
    assert.match(r.message, /jq: command not found/);
  }
});

test("jd paths", async () => {
  fakeSays({ ok: true, config: "/c/config.json", journal: "/s/journal.jsonl", install: "/d/cli", warnings: [] });
  assert.deepEqual(await jdPaths(fake), { config: "/c/config.json", journal: "/s/journal.jsonl", install: "/d/cli" });
  assert.deepEqual(lastArgs(), ["paths", "--json"]);
});
