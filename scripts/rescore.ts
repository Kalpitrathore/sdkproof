/**
 * Re-verify a library's STORED candidates and rewrite its scorecard.
 *
 * No API calls: generation already happened and is on disk. Only tsc runs
 * again. This exists because verify() itself has been wrong twice — once when
 * an empty candidate compiled clean and scored as a pass (2026-08-04), and
 * again when `emptyCandidate` swallowed the body of any candidate written
 * without semicolons and recorded a complete answer as "no implementation"
 * (found 2026-08-22). A stored run is only as good as the checker that scored
 * it, so the checker changing means the number has to be recomputed rather
 * than trusted.
 *
 * Read-only by default. It prints the old number beside the new one and
 * touches nothing unless --write is passed.
 *
 *   tsx scripts/rescore.ts <libId> [--write]
 *   tsx scripts/rescore.ts --all
 *
 * A run stored under a label that is not a library id — the board's `prisma7`
 * is `data/prisma7.*` scored against the `prisma` spec — needs the spec named:
 *
 *   tsx scripts/rescore.ts prisma7 --spec prisma
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ALL_SPECS } from "../src/libraries/index.ts";
import { projectRoot, tscEntry } from "../src/env.ts";
import { recommend } from "../src/recommend.ts";
import { renderScorecard } from "../src/report.ts";
import { score } from "../src/score.ts";
import { verify } from "../src/verify.ts";
import type { Candidate, Result, Verdict } from "../src/types.ts";

const argv = process.argv.slice(2);
const write = argv.includes("--write");
const all = argv.includes("--all");
const specFlag = argv[argv.indexOf("--spec") + 1];
const ids = all
  ? Object.keys(ALL_SPECS)
  : argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--spec");

if (!ids.length) {
  console.error("usage: tsx scripts/rescore.ts <libId> [--write]   |   tsx scripts/rescore.ts --all");
  process.exit(2);
}

let changed = 0;

for (const id of ids) {
  const spec = ALL_SPECS[specFlag ?? id];
  if (!spec) {
    console.error(`unknown lib: ${specFlag ?? id} (known: ${Object.keys(ALL_SPECS).join(", ")})`);
    process.exit(2);
  }
  const candidatesPath = path.join(projectRoot, "data", `${id}.candidates.json`);
  const resultPath = path.join(projectRoot, "data", `${id}.result.json`);

  let candidates: Candidate[];
  let previous: Result;
  try {
    candidates = JSON.parse(await readFile(candidatesPath, "utf8"));
    previous = JSON.parse(await readFile(resultPath, "utf8"));
  } catch {
    console.log(`${id.padEnd(16)} no stored run`);
    continue;
  }

  // The candidates file must be the one that produced this result. It is not
  // always: a `--fake` zod run on 2026-08-04 overwrote data/zod.candidates.json
  // with Prisma stubs from the offline adapter, and the real generations are
  // gone. Re-verifying that pair produces 0/6 from a run that was 10/10, and
  // writing it would replace a measured number with a fabricated one — the one
  // unrecoverable error for a project whose argument is "the compiler decides".
  const key = (v: { taskId: string; model: string }) => `${v.taskId}@${v.model}`;
  const stored = previous.verdicts.map(key).sort().join("|");
  const onDisk = candidates.map(key).sort().join("|");
  if (stored !== onDisk) {
    console.log(
      `${id.padEnd(16)} SKIPPED — data/${id}.candidates.json does not match this result ` +
        `(${candidates.length} candidate(s) vs ${previous.verdicts.length} verdict(s)). ` +
        `The generations behind the stored score are not on disk, so it cannot be recomputed.`,
    );
    continue;
  }

  process.stdout.write(`${id.padEnd(16)} `);
  const verdicts: Verdict[] = [];
  for (const c of candidates) {
    const v = await verify(c, spec, { tscEntry });
    verdicts.push(v);
    process.stdout.write(v.passed ? "✓" : "✗");
  }

  // generatedAt is when the MODEL was sampled, not when tsc last ran. Keeping
  // it means the scorecard still dates the measurement rather than the re-check.
  const result = score(
    previous.library,
    previous.libraryVersion,
    previous.generatedAt,
    verdicts,
    previous.refusals ?? [],
    previous.contextArms ?? [],
    previous.lost ?? [],
  );

  const passedBefore = previous.verdicts.filter((v) => v.passed).length;
  const passedNow = verdicts.filter((v) => v.passed).length;
  const moved = passedBefore !== passedNow;
  console.log(
    `  ${passedBefore}/${previous.verdicts.length} -> ${passedNow}/${verdicts.length}` +
      (moved ? "   CHANGED" : ""),
  );
  if (moved) {
    changed++;
    for (const now of verdicts) {
      const before = previous.verdicts.find((v) => v.taskId === now.taskId && v.model === now.model);
      if (!before || before.passed === now.passed) continue;
      const was = before.errors[0];
      console.log(
        `    ${now.taskId} [${now.model}]: ${before.passed ? "pass -> fail" : "fail -> pass"}` +
          (was ? `  (was ${was.code}: ${was.message.slice(0, 80)})` : ""),
      );
    }
  }

  if (!write) continue;

  // Same tail as cli.ts, so a rewritten scorecard is byte-comparable with one
  // a fresh run would produce.
  try {
    const survey = JSON.parse(await readFile(path.join(projectRoot, "data", "agent-docs.json"), "utf8"));
    const recs = await recommend(result, spec, survey);
    if (recs.length) result.recommendations = recs;
  } catch {
    const recs = await recommend(result, spec);
    if (recs.length) result.recommendations = recs;
  }

  await writeFile(resultPath, JSON.stringify(result, null, 2));
  await writeFile(path.join(projectRoot, "scorecards", `${id}.md`), renderScorecard(result, spec));
  console.log(`    wrote data/${id}.result.json & scorecards/${id}.md`);
}

if (!write && changed) {
  console.log(`\n${changed} library(ies) changed. Re-run with --write to rewrite their scorecards.`);
}
