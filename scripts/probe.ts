// Run the collector against the real systems in jd's config and report
// what it found. No Raycast needed: `node scripts/probe.ts [SYS] [--list]`.
import { readSystems } from "../src/lib/config.ts";
import { collectSystem } from "../src/lib/collect.ts";

const args = process.argv.slice(2);
const only = args.find((a) => !a.startsWith("--"));
const showList = args.includes("--list");

for (const system of readSystems()) {
  if (only && system.sys !== only) continue;
  const t0 = performance.now();
  const { entries, duplicates, errors } = collectSystem(system);
  const ms = Math.round(performance.now() - t0);

  const byKind: Record<string, number> = {};
  for (const e of entries) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  const noFolder = entries.filter((e) => !e.folderPath && e.kind !== "area" && e.kind !== "category");
  const noNote = entries.filter((e) => !e.notePath);
  const described = entries.filter((e) => e.description).length;

  console.log(`\n== ${system.sys} (${entries.length} rows, ${ms} ms)`);
  console.log("kinds:", byKind);
  console.log(`with description: ${described}`);
  console.log(
    `note but no folder: ${noFolder.length}`,
    noFolder.slice(0, 8).map((e) => e.key),
  );
  console.log(
    `folder but no note: ${noNote.length}`,
    noNote.slice(0, 8).map((e) => e.key),
  );
  if (duplicates.length) console.log("duplicates:", duplicates);
  if (errors.length) console.log("errors:", errors);
  if (showList) for (const e of entries) console.log(`${e.key}\t${e.kind}\t${e.title}\t${e.description ?? ""}`);
}
