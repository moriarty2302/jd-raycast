import { test } from "node:test";
import assert from "node:assert/strict";
import type { Entry } from "../src/lib/collect.ts";
import type { NewWpOk } from "../src/lib/jd.ts";
import { parseName, sortKey } from "../src/lib/names.ts";
import { fieldValues, formFields, previewMarkdown, resultMarkdown, validate, wpParents } from "../src/lib/wp.ts";

function entry(name: string, sys = "D25"): Entry {
  const p = parseName(name)!;
  return { sys, key: p.key, title: p.title, kind: p.kind, sortKey: sortKey(p.key, p.kind), aliases: [], ...p };
}

const entries = [
  entry("21 Products"),
  entry("21.00 Index for category 21"),
  entry("21.20 ◾Delivery"),
  entry("21.25 Content delivery"),
  entry("21.13+ AI"),
  entry("21.11 Planning"),
  entry("W0010~34.11 A talk"),
  entry("11.12 Passports", "P76"),
];

const toFill = [
  { token: "OUTCOME", brief: "What will exist when this is done", flag: "--outcome" },
  { token: "NEXT_STEP", brief: "First thing to do", flag: "--next-step" },
];

const dry: NewWpOk = {
  ok: true,
  sys: "D25",
  num: "W0033",
  id: "21.25",
  title: "Draft the FAQ",
  name: "W0033~21.25 Draft the FAQ",
  note: "/v/W0033~21.25 Draft the FAQ.md",
  folder: "/f/W0033~21.25 Draft the FAQ",
  template: "/f/W0003 Templates/Work package template.md",
  toFill: [toFill[1]],
  warnings: [],
  dryRun: true,
};

test("parents are plain IDs in the chosen system, in ID order", () => {
  assert.deepEqual(
    wpParents(entries, "D25").map((e) => e.key),
    ["21.11", "21.25"],
  );
});

test("template tokens become optional fields", () => {
  const f = formFields(toFill);
  assert.deepEqual(
    f.map((x) => [x.label, x.flag, x.placeholder]),
    [
      ["Outcome", "--outcome", "What will exist when this is done"],
      ["Next step", "--next-step", "First thing to do"],
    ],
  );
  assert.deepEqual(fieldValues({ [f[0].id]: "  An FAQ  ", [f[1].id]: "   " }, f), { "--outcome": "An FAQ" });
});

test("validation: parent must be a real ID, title required", () => {
  const parents = wpParents(entries, "D25");
  assert.deepEqual(validate({ parent: "21.25", title: "Draft" }, parents), {});
  assert.ok(validate({ parent: "99.99", title: "Draft" }, parents).parent);
  assert.ok(validate({ parent: "21.25", title: "  " }, parents).title);
  assert.ok(validate({}, parents).parent);
});

test("preview says what will be made and what is left as prompts", () => {
  const md = previewMarkdown(dry, { tasks: true, adapter: "things" });
  assert.match(md, /# W0033~21\.25 Draft the FAQ/);
  assert.match(md, /Nothing has been made yet/);
  assert.match(md, /\*\*Things project\*\* — from the template project/);
  assert.match(md, /next_step — \*First thing to do\*/);
  assert.match(previewMarkdown(dry, { tasks: false, adapter: "things" }), /Things project\*\* — skipped/);
  assert.doesNotMatch(previewMarkdown(dry, { tasks: true }), /project\*\*/);
});

test("result shows the refresh warning in plain words", () => {
  const md = resultMarkdown({
    ...dry,
    dryRun: false,
    tasksUrl: "things:///show?id=X",
    warnings: ["tasks_refresh_failed"],
  });
  assert.match(md, /things:\/\/\/show\?id=X/);
  assert.match(md, /couldn't be refreshed/);
});

test("wrapNote moves a bare note into a same-named folder, and never overwrites", async () => {
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const { wrapNote } = await import("../src/lib/wp.ts");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jd-raycast-wrap-"));
  try {
    const bare = path.join(dir, "W0033~21.25 Draft the FAQ.md");
    fs.writeFileSync(bare, "note");
    const r = wrapNote(bare);
    const target = path.join(dir, "W0033~21.25 Draft the FAQ", "W0033~21.25 Draft the FAQ.md");
    assert.deepEqual(r, { path: target, wrapped: true });
    assert.equal(fs.readFileSync(target, "utf-8"), "note");
    assert.ok(!fs.existsSync(bare));

    // Running it again on the wrapped note changes nothing.
    assert.equal(wrapNote(target).wrapped, false);

    // A clash leaves the bare note where it is.
    const clash = path.join(dir, "W0034~21.25 Other.md");
    fs.writeFileSync(clash, "new");
    fs.mkdirSync(path.join(dir, "W0034~21.25 Other"));
    fs.writeFileSync(path.join(dir, "W0034~21.25 Other", "W0034~21.25 Other.md"), "old");
    const c = wrapNote(clash);
    assert.equal(c.wrapped, false);
    assert.equal(fs.readFileSync(clash, "utf-8"), "new");
    assert.equal(fs.readFileSync(path.join(dir, "W0034~21.25 Other", "W0034~21.25 Other.md"), "utf-8"), "old");

    assert.equal(wrapNote(path.join(dir, "missing.md")).wrapped, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("template markers are found per token", async () => {
  const { templatePrefixes } = await import("../src/lib/wp.ts");
  const tpl = `---
ID: {{W}}~{{ID}}
---
> {{?OUTCOME What will exist when this is done}}
#### Scope
- {{?SCOPE What's in and out}}
#### Steps
1. {{?FIRST_STEP The first step}}
Owner: {{?OWNER Who}}
> - {{?RISK Main risk}}`;
  assert.deepEqual(templatePrefixes(tpl), {
    OUTCOME: "> ",
    SCOPE: "- ",
    FIRST_STEP: "1. ",
    OWNER: "",
    RISK: "> - ",
  });
});

test("multi-line answers continue the template's marker", async () => {
  const { continueLines, formFields, fieldValues } = await import("../src/lib/wp.ts");
  assert.equal(continueLines("First\nSecond\n\nThird  ", "- "), "First\n- Second\n- Third");
  // A line typed with the marker already keeps just one.
  assert.equal(continueLines("- First\n- Second", "- "), "First\n- Second");
  assert.equal(continueLines("One\nTwo", "> "), "One\n> Two");
  // Bullets inside a quote: type "- " yourself.
  assert.equal(continueLines("- One\n- Two", "> "), "- One\n> - Two");
  assert.equal(continueLines("Just one", "- "), "Just one");
  const f = formFields([{ token: "SCOPE", brief: "b", flag: "--scope" }], { SCOPE: "- " });
  assert.deepEqual(fieldValues({ [f[0].id]: "In: pricing\nOut: legal" }, f), {
    "--scope": "In: pricing\n- Out: legal",
  });
});

test("the template decides which fields are multi-line", async () => {
  const { isListPrefix, formFields, fieldValues } = await import("../src/lib/wp.ts");
  assert.equal(isListPrefix("- "), true);
  assert.equal(isListPrefix("* "), true);
  assert.equal(isListPrefix("1. "), true);
  assert.equal(isListPrefix("> - "), true);
  assert.equal(isListPrefix("> "), false);
  assert.equal(isListPrefix(""), false);

  const toFill = [
    { token: "OUTCOME", brief: "o", flag: "--outcome" },
    { token: "SCOPE", brief: "s", flag: "--scope" },
  ];
  const f = formFields(toFill, { OUTCOME: "> ", SCOPE: "- " });
  assert.deepEqual(
    f.map((x) => [x.label, x.multiline]),
    [
      ["Outcome", false],
      ["Scope", true],
    ],
  );
  // A one-line field never carries a line break to jd.
  assert.deepEqual(fieldValues({ [f[0].id]: "Clarity\nfor sales", [f[1].id]: "A\nB" }, f), {
    "--outcome": "Clarity for sales",
    "--scope": "A\n- B",
  });
});
