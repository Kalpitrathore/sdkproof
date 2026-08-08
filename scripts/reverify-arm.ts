/**
 * Re-verify an arm's STORED candidates. No API calls — generation already
 * happened and is on disk; this only re-runs tsc over it.
 *
 * Why this exists: the `distant-25k` arm was dropped from the React Router
 * spec when the mechanism was narrowed by bisection (88fd553), so its verdicts
 * never made it into rr-meta.result.json — but its 8/10 is quoted on
 * agent-docs.html as the load-bearing "it isn't length" control. The
 * generations survived in data/rr-meta.arm-distant-25k.candidates.json, so the
 * number can be recomputed exactly rather than trusted.
 *
 *   tsx scripts/reverify-arm.ts <candidates.json> <libId>
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { verify } from "../src/verify.ts";
import { tscEntry, projectRoot } from "../src/env.ts";
import { reactRouterSpec } from "../src/libraries/react-router.ts";
import type { Candidate } from "../src/types.ts";

const SPECS: Record<string, typeof reactRouterSpec> = {
  "react-router": reactRouterSpec,
};

const [file, libId = "react-router"] = process.argv.slice(2);
if (!file) {
  console.error("usage: tsx scripts/reverify-arm.ts <candidates.json> [libId]");
  process.exit(2);
}
const spec = SPECS[libId];
if (!spec) {
  console.error(`unknown lib: ${libId}`);
  process.exit(2);
}

const abs = path.isAbsolute(file) ? file : path.join(projectRoot, file);
const raw = JSON.parse(await readFile(abs, "utf8")) as Candidate[][] | Candidate[];
// Stored shape is trials[] of candidates[]; tolerate a flat list too.
const trials: Candidate[][] = Array.isArray(raw[0]) ? (raw as Candidate[][]) : [raw as Candidate[]];

// Same accounting rule as cli.ts: count per task, and report how many
// generations were actually present so a missing one can't inflate the rate.
const byTask = new Map<string, { pass: number; seen: number }>();
let total = 0;
let passed = 0;

for (let t = 0; t < trials.length; t++) {
  process.stdout.write(`t${t + 1} `);
  for (const c of trials[t]) {
    const v = await verify(c, spec, { tscEntry });
    total++;
    if (v.passed) passed++;
    const e = byTask.get(c.taskId) ?? { pass: 0, seen: 0 };
    e.seen++;
    if (v.passed) e.pass++;
    byTask.set(c.taskId, e);
    process.stdout.write(v.passed ? "✓" : "✗");
  }
  process.stdout.write("\n");
}

console.log(`\ntrials: ${trials.length}  generations verified: ${total}`);
for (const [taskId, e] of byTask) {
  console.log(`  ${taskId}: ${e.pass}/${e.seen}`);
}
console.log(`OVERALL: ${passed}/${total}`);
