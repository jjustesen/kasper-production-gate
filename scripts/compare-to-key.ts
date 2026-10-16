// Compare a gate run with the answer key. Used to check a live model run:
//
//   npm run gate -- --live --cache cache/live_run.json --out out/live
//   npm run compare -- out/live/results.json

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(import.meta.url), "..", "..");

interface Row { brief_id: string; status: string; reasons: Array<{ code: string }> }
interface Expected { status: string; codes: string[]; why: string }

const { _comment, ...key } = JSON.parse(readFileSync(join(ROOT, "expected", "gate_expected.json"), "utf-8")) as Record<string, Expected>;
const resultsPath = process.argv[2] ?? join(ROOT, "out", "results.json");
const rows = (JSON.parse(readFileSync(resultsPath, "utf-8")) as { briefs: Row[] }).briefs;

let mismatches = 0;
for (const row of rows) {
  const want = key[row.brief_id];
  const got = [...new Set(row.reasons.map((r) => r.code))].sort();
  if (row.status !== want.status || JSON.stringify(got) !== JSON.stringify([...want.codes].sort())) {
    mismatches += 1;
    console.log(`${row.brief_id}: got ${row.status} [${got}], expected ${want.status} [${want.codes}] (${want.why})`);
  }
}
console.log(`${rows.length - mismatches}/${rows.length} briefs match the answer key`);
process.exitCode = mismatches ? 1 : 0;
