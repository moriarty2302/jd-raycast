// Try queries against the real systems: `node scripts/try.ts "11 pass" passport`.
import { readSystems } from "../src/lib/config.ts";
import { collectAll } from "../src/lib/collect.ts";
import { displayKey, search } from "../src/lib/query.ts";

const { entries } = collectAll(readSystems());
for (const q of process.argv.slice(2)) {
  const t0 = performance.now();
  const r = search(entries, q);
  console.log(`\n"${q}" → ${r.length} (${Math.round(performance.now() - t0)} ms)`);
  for (const e of r.slice(0, 6)) console.log(`  ${e.sys}  ${displayKey(e).padEnd(10)} ${e.title}`);
}
