import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExtendFolder, parseName, sortKey } from "../src/lib/names.ts";
import { parseNoteHead } from "../src/lib/collect.ts";

test("areas and categories", () => {
  assert.deepEqual(parseName("10-19 Life admin"), { key: "10-19", title: "Life admin", kind: "area" });
  assert.deepEqual(parseName("11 Me & other living things 🙋"), {
    key: "11",
    title: "Me & other living things 🙋",
    kind: "category",
  });
});

test("IDs, zeros and headers", () => {
  assert.equal(parseName("11.12 Passports, residency, & citizenship")?.kind, "id");
  assert.equal(parseName("11.01 Inbox for category 11")?.kind, "zero");
  const header = parseName("11.10 ■ Personal records 🗂");
  assert.equal(header?.kind, "header");
  assert.equal(header?.title, "Personal records 🗂");
  assert.equal(parseName("11.10 ◾Company overview")?.title, "Company overview");
  assert.equal(parseName("14.20 Software & accounts")?.kind, "header");
});

test("extends", () => {
  assert.deepEqual(parseName("11.16+ABC Legal documents & certificates"), {
    key: "11.16+ABC",
    title: "Legal documents & certificates",
    kind: "extend",
  });
  assert.deepEqual(parseName("14.22+ Claude"), { key: "14.22+ Claude", title: "Claude", kind: "extend" });
  assert.equal(parseExtendFolder("11.16", "+ABC Legal documents & certificates")?.key, "11.16+ABC");
  assert.equal(parseExtendFolder("12.24", "+ Kitchen renovation")?.key, "12.24+ Kitchen renovation");
  assert.equal(parseExtendFolder("12.24", "Receipts"), null);
});

test("work packages", () => {
  assert.deepEqual(parseName("W0010~34.11 2025-12 Conference talk on data sharing @complete"), {
    key: "W0010",
    title: "2025-12 Conference talk on data sharing",
    kind: "wp",
    wpFor: "34.11",
    status: "complete",
  });
  assert.equal(parseName("W0003 Templates")?.key, "W0003");
});

test("not JD names", () => {
  assert.equal(parseName("P76 Inbox"), null);
  assert.equal(parseName("2026-04-19"), null);
  assert.equal(parseName("Receipts"), null);
});

test("sort keys put everything in JD order", () => {
  const items: Array<[string, Parameters<typeof sortKey>[1]]> = [
    ["11", "category"],
    ["W0010", "wp"],
    ["10.12+X", "extend"],
    ["10-19", "area"],
    ["10.13", "id"],
    ["10", "category"],
    ["10.12", "id"],
    ["11.00", "zero"],
    ["20-29", "area"],
  ];
  const sorted = items
    .map(([k, kind]) => ({ k, s: sortKey(k, kind) }))
    .sort((a, b) => (a.s < b.s ? -1 : 1))
    .map((x) => x.k);
  assert.deepEqual(sorted, ["10-19", "10", "10.12", "10.12+X", "10.13", "11", "11.00", "20-29", "W0010"]);
});

test("note head: current note format", () => {
  const text = `---
jd_id: "11.23"
location: filesystem
related: []
url:
aliases: ["Primary care", "GP"]
---
> Doctors, surgery and prescriptions.
- - -
#### Notes`;
  assert.deepEqual(parseNoteHead(text), {
    aliases: ["Primary care", "GP"],
    description: "Doctors, surgery and prescriptions.",
    status: undefined,
  });
});

test("note head: older note format and placeholders", () => {
  const placeholder = `---
ID: "42.00"
Title: Index for category 42
---
>This ID is about…
---

>Location:
`;
  assert.equal(parseNoteHead(placeholder).description, undefined);

  const wp = `---
ID: W0010~34.11
status: complete
Title: A talk
---
> I gave a talk.
---

>Location: filesystem, notes`;
  const head = parseNoteHead(wp);
  assert.equal(head.description, "I gave a talk.");
  assert.equal(head.status, "complete");
});
