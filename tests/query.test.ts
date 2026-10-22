import { test } from "node:test";
import assert from "node:assert/strict";
import type { Entry } from "../src/lib/collect.ts";
import { parseName, sortKey } from "../src/lib/names.ts";
import { displayKey, parseQuery, search } from "../src/lib/query.ts";

function entry(name: string, extra: Partial<Entry> = {}, sys = "P76"): Entry {
  const p = parseName(name)!;
  return {
    sys,
    key: p.key,
    title: p.title,
    kind: p.kind,
    sortKey: sortKey(p.key, p.kind),
    aliases: [],
    ...p,
    ...extra,
  };
}

const entries: Entry[] = [
  entry("10-19 Life admin"),
  entry("11 Me & other living things"),
  entry("11.00 JDex for category 11"),
  entry("11.10 ■ Personal records"),
  entry("11.11 Birth certificate & proof of name"),
  entry("11.12 Passports, residency, & citizenship", { description: "Passports and visas" }),
  entry("11.16+ABC Legal documents & certificates"),
  entry("12 Where I live"),
  entry("12.24 Renovations & improvements"),
  entry("14.22+ Claude", { description: "How Claude is configured" }),
  entry("20-29 Products, services & processes", {}, "D25"),
  entry("34.11 My public presentations", {}, "D25"),
  entry("W0010~34.11 2025-12 Conference talk on data sharing", {}, "D25"),
];
const keys = (text: string) => search(entries, text).map((e) => e.key);

test("parseQuery splits a leading number from words", () => {
  assert.deepEqual(parseQuery("11 pass"), { scope: "11", words: "pass" });
  assert.deepEqual(parseQuery("11.1"), { scope: "11.1", words: "" });
  assert.deepEqual(parseQuery("W0 conference"), { scope: "w0", words: "conference" });
  assert.deepEqual(parseQuery("passport"), { words: "passport" });
  assert.deepEqual(parseQuery("2026 budget"), { words: "2026 budget" });
});

test("numbers narrow in ID order", () => {
  assert.deepEqual(keys("11"), ["11", "11.00", "11.10", "11.11", "11.12", "11.16+ABC"]);
  assert.deepEqual(keys("11.1"), ["11.10", "11.11", "11.12", "11.16+ABC"]);
  assert.deepEqual(keys("10-19"), [
    "10-19",
    "11",
    "11.00",
    "11.10",
    "11.11",
    "11.12",
    "11.16+ABC",
    "12",
    "12.24",
    "14.22+ Claude",
  ]);
  assert.deepEqual(keys("w0"), ["W0010"]);
});

test("an ID scope also finds its work packages", () => {
  assert.deepEqual(keys("34.11"), ["34.11", "W0010"]);
});

test("words rank by match, with typos", () => {
  assert.equal(keys("passport")[0], "11.12");
  assert.equal(keys("pasport")[0], "11.12");
  assert.deepEqual(keys("11 cert").sort(), ["11.11", "11.16+ABC"]);
  assert.equal(keys("claude")[0], "14.22+ Claude");
});

test("headers and zeros rank below real IDs", () => {
  const r = keys("records");
  assert.equal(r[0], "11.10"); // only match, still found
  // Same title on a header and a real ID: the real ID comes first.
  const withTwin = [...entries, entry("11.13 Personal records")];
  assert.deepEqual(
    search(withTwin, "personal records")
      .map((e) => e.key)
      .slice(0, 2),
    ["11.13", "11.10"],
  );
});

test("display key", () => {
  assert.equal(displayKey(entry("14.22+ Claude")), "14.22+");
  assert.equal(displayKey(entry("11.16+ABC Legal")), "11.16+ABC");
});

test("typos fall back to edit distance", () => {
  assert.equal(keys("pasport")[0], "11.12");
  assert.equal(keys("confrence")[0], "W0010");
  assert.deepEqual(keys("zzzz"), []);
});
