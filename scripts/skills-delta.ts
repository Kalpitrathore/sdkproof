/**
 * Skills-aware scoring — does the agent context a library ships actually move
 * its score, and can we tell?
 *
 * The request behind it, from a Prisma maintainer on 2026-07-31: "does it still
 * do that even with the skills that `prisma init` installs?" How well a model
 * knows an API is not something a maintainer controls. Whether the skill files
 * they ship close the gap is.
 *
 * This reads what is already on disk — no generation, no API calls — and puts a
 * Newcombe interval on every arm against its own baseline. Arms whose interval
 * straddles zero are printed as "no measurable effect", never as a direction.
 *
 *   npx tsx scripts/skills-delta.ts
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "../src/env.ts";
import { armDelta, wilson, fmtInterval } from "../src/stats.ts";

interface Arm {
  name: string;
  label?: string;
  passed: number;
  total: number;
  score: number;
  baselineScore: number;
  comparedOn?: number;
  trials?: number;
  fixed?: string[];
  failed?: string[];
}

interface Result {
  library?: string;
  libraryVersion?: string;
  overallScore?: number;
  contextArms?: Arm[];
}

/**
 * The baseline is stored as a rounded percentage, not a count. Recovering the
 * count matters: an interval needs a denominator, and 91% of 45 is 40.95. The
 * arm total is the right denominator because every arm and the baseline are
 * compared on the same task set over the same number of trials — that is what
 * `comparedOn` and `trials` record.
 */
const baselineCount = (arm: Arm) => Math.round((arm.baselineScore / 100) * arm.total);

const pp = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(100 * x).toFixed(1)}`;

async function main() {
  const dir = path.join(projectRoot, "data");
  const files = (await readdir(dir)).filter((f) => f.endsWith(".result.json")).sort();

  const rows: Array<{
    file: string;
    library: string;
    arm: Arm;
    d: ReturnType<typeof armDelta>;
    scope: "scorecard" | "failing-task";
  }> = [];

  for (const f of files) {
    const r: Result = JSON.parse(await readFile(path.join(dir, f), "utf8"));
    if (!r.contextArms?.length) continue;
    // A full scorecard run carries 15 tasks; the drift runs isolate the single
    // task the library actually fails. The distinction is the whole finding, so
    // it is derived from the data rather than hardcoded per file.
    const scope = (r.contextArms[0].comparedOn ?? 1) > 1 ? "scorecard" : "failing-task";
    for (const arm of r.contextArms) {
      rows.push({
        file: f.replace(".result.json", ""),
        library: r.library ?? f,
        arm,
        d: armDelta(arm.passed, arm.total, baselineCount(arm), arm.total),
        scope,
      });
    }
  }

  for (const scope of ["scorecard", "failing-task"] as const) {
    const group = rows.filter((r) => r.scope === scope);
    if (!group.length) continue;
    console.log(
      `\n${"=".repeat(96)}\n${
        scope === "scorecard"
          ? "WHOLE SCORECARD — all 15 tasks, the naive reading of 'score twice and report the delta'"
          : "FAILING TASK ONLY — the one task the library actually gets wrong"
      }\n${"=".repeat(96)}`,
    );
    console.log(
      `${"run".padEnd(18)}${"arm".padEnd(16)}${"arm rate".padEnd(20)}${"vs base".padEnd(10)}${"95% CI on the difference".padEnd(26)}verdict`,
    );
    for (const { file, arm, d } of group) {
      const ci = wilson(arm.passed, arm.total);
      console.log(
        file.padEnd(18) +
          arm.name.padEnd(16) +
          `${arm.passed}/${arm.total} ${fmtInterval(ci)}`.padEnd(20) +
          `${pp(d.diff)}pp`.padEnd(10) +
          `${pp(d.low)} .. ${pp(d.high)}pp`.padEnd(26) +
          (d.significant
            ? d.diff > 0
              ? "✅ REAL IMPROVEMENT"
              : "🔴 REAL REGRESSION"
            : "— no measurable effect"),
      );
    }
  }

  const sc = rows.filter((r) => r.scope === "scorecard");
  const ft = rows.filter((r) => r.scope === "failing-task");
  const sig = (xs: typeof rows) => xs.filter((r) => r.d.significant).length;

  console.log(`\n${"=".repeat(96)}`);
  console.log(
    `whole-scorecard arms:  ${sig(sc)} of ${sc.length} show any effect at 95%`,
  );
  console.log(
    `failing-task arms:     ${sig(ft)} of ${ft.length} show any effect at 95%`,
  );
  console.log(`${"=".repeat(96)}`);
}

await main();
