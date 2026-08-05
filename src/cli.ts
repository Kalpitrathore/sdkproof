import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { prismaSpec } from "./libraries/prisma.ts";
import { aisdkSpec } from "./libraries/aisdk.ts";
import { zodSpec } from "./libraries/zod.ts";
import { tanstackQuerySpec } from "./libraries/tanstack-query.ts";
import { nextjsSpec } from "./libraries/nextjs.ts";
import { reactRouterSpec } from "./libraries/react-router.ts";
import { stripeSpec } from "./libraries/stripe.ts";
import { projectRoot, tscEntry } from "./env.ts";
import { generate } from "./generate.ts";
import { loadArms } from "./context.ts";
import { RefusalError } from "./models/types.ts";
import { verify } from "./verify.ts";
import { score } from "./score.ts";
import { renderScorecard } from "./report.ts";
import { activeAdapters } from "./models/index.ts";
import { fakeAdapters } from "./models/fake.ts";
import type { ArmScore, Candidate, LibrarySpec, Refusal, Task, Verdict } from "./types.ts";

const SPECS: Record<string, LibrarySpec> = { prisma: prismaSpec, aisdk: aisdkSpec, zod: zodSpec, "tanstack-query": tanstackQuerySpec, nextjs: nextjsSpec, "react-router": reactRouterSpec, stripe: stripeSpec };

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function libVersion(packageName: string): Promise<string> {
  try {
    const p = path.join(projectRoot, "node_modules", ...packageName.split("/"), "package.json");
    return JSON.parse(await readFile(p, "utf8")).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function main(): Promise<void> {
  // Load sdkproof/.env if present so ANTHROPIC_API_KEY / OPENAI_API_KEY can live
  // in a local gitignored file instead of the shell environment.
  try {
    process.loadEnvFile(path.join(projectRoot, ".env"));
  } catch {
    // no .env file — rely on the ambient environment
  }

  const argv = process.argv.slice(2);
  if (argv[0] !== "run") {
    console.error("usage: sdkproof run --lib <id> [--fake] [--limit N] [--with-context] [--trials N]");
    process.exit(1);
  }

  const libId = flag(argv, "--lib") ?? "prisma";
  const useFake = argv.includes("--fake");
  const withContext = argv.includes("--with-context");
  const trials = Math.max(1, Number(flag(argv, "--trials") ?? "1"));
  const limit = Number(flag(argv, "--limit") ?? "0");
  const tasksFlag = flag(argv, "--tasks");

  const spec = SPECS[libId];
  if (!spec) {
    console.error(`unknown lib: ${libId} (known: ${Object.keys(SPECS).join(", ")})`);
    process.exit(1);
  }

  const tasksPath = tasksFlag
    ? path.resolve(tasksFlag)
    : path.join(projectRoot, "data", `${libId}.tasks.json`);
  // Output label: derived from a custom task file so runs don't clobber each other.
  const label = tasksFlag
    ? path.basename(tasksPath).replace(/\.tasks\.json$/, "")
    : libId;
  let tasks: Task[] = JSON.parse(await readFile(tasksPath, "utf8"));
  if (limit > 0) tasks = tasks.slice(0, limit);

  const adapters = useFake ? fakeAdapters() : activeAdapters();
  if (adapters.length === 0) {
    console.error(
      "No model API keys found. Set ANTHROPIC_API_KEY and/or OPENAI_API_KEY, or pass --fake for an offline pipeline test.",
    );
    process.exit(1);
  }

  console.log(`Scoring ${spec.displayName} with ${adapters.length} model(s): ${adapters.map((a) => a.id).join(", ")}`);
  console.log(`Tasks: ${tasks.length}`);

  // Generate concurrently (each task × model is independent).
  process.stdout.write("Generating ");
  const candidates: Candidate[] = [];
  // A refusal is an UNMEASURED task, not a failed one — the model never wrote
  // code, so nothing about the library was tested. Kept apart from generic
  // failures so the scorecard can say so out loud instead of quietly shrinking.
  const refusals: Refusal[] = [];
  await Promise.all(
    adapters.flatMap((m) =>
      tasks.map(async (t) => {
        try {
          candidates.push(await generate(t, m, spec));
          process.stdout.write(".");
        } catch (e) {
          if (e instanceof RefusalError) {
            refusals.push({ taskId: t.id, model: m.id, attempts: e.attempts });
            process.stdout.write("R");
          } else {
            console.error(`\n  generate failed [${m.id}/${t.id}]: ${(e as Error).message}`);
          }
        }
      }),
    ),
  );
  process.stdout.write("\n");
  if (refusals.length) {
    console.log(
      `Refused: ${refusals.length}/${tasks.length * adapters.length} — ${[...new Set(refusals.map((r) => r.taskId))].join(", ")}`,
    );
    console.log("  (unmeasured, not counted as drift — see the scorecard)");
  }

  // --with-context: score the SAME tasks again, once per arm, with the agent
  // files the library ships for itself. The bare arm above is untouched, so a
  // context run can never move the published number — it only adds a delta
  // beside it. That delta is the thing a maintainer can act on.
  // --with-context: score the SAME tasks again, once per arm, with the agent
  // files the library ships. The bare run above is untouched, so a context run
  // can never move a published number — it only adds a delta beside it.
  //
  // --trials N repeats every cell, INCLUDING the bare arm. Comparing a 1-trial
  // baseline against an N-trial arm would be the same mistake as comparing arms
  // over different task sets: the model is stochastic, and a single flipped task
  // is worth 6 points on a 15-task set.
  const armCandidates = new Map<string, Candidate[][]>();
  const bareTrials: Candidate[][] = [];
  if (withContext) {
    if (!spec.agentContext) {
      console.error(`--with-context: ${spec.id} declares no agentContext`);
      process.exit(1);
    }
    const arms = await loadArms(spec.agentContext);
    console.log(`\nContext arms (${spec.agentContext.source}), ${trials} trial(s) each:`);
    for (const arm of spec.agentContext.arms) {
      console.log(`  ${arm.name}: ${arms.get(arm.name)!.length} chars — ${arm.label}`);
    }

    const runTrial = async (label2: string, context: string | undefined) => {
      const got: Candidate[] = [];
      await Promise.all(
        adapters.flatMap((m) =>
          tasks.map(async (t) => {
            try {
              got.push(await generate(t, m, spec, context));
              process.stdout.write(".");
            } catch (e) {
              if (e instanceof RefusalError) process.stdout.write("R");
              else console.error(`\n  generate failed [${label2}/${t.id}]: ${(e as Error).message}`);
            }
          }),
        ),
      );
      return got;
    };

    // Trial 1 of the bare arm is the run already generated above; only extra
    // trials cost anything new.
    bareTrials.push(candidates);
    for (let t = 2; t <= trials; t++) {
      process.stdout.write(`Generating [bare t${t}] `);
      bareTrials.push(await runTrial(`bare/t${t}`, undefined));
      process.stdout.write("\n");
    }
    for (const arm of spec.agentContext.arms) {
      const per: Candidate[][] = [];
      for (let t = 1; t <= trials; t++) {
        process.stdout.write(`Generating [${arm.name} t${t}] `);
        per.push(await runTrial(`${arm.name}/t${t}`, arms.get(arm.name)));
        process.stdout.write("\n");
      }
      armCandidates.set(arm.name, per);
      await mkdir(path.join(projectRoot, "data"), { recursive: true });
      await writeFile(
        path.join(projectRoot, "data", `${label}.arm-${arm.name}.candidates.json`),
        JSON.stringify(per, null, 2),
      );
    }
  }


  await mkdir(path.join(projectRoot, "data"), { recursive: true });
  await writeFile(
    path.join(projectRoot, "data", `${label}.candidates.json`),
    JSON.stringify(candidates, null, 2),
  );

  // Verify sequentially — all candidates share the fixture's candidate.ts.
  process.stdout.write("Verifying  ");
  const verdicts: Verdict[] = [];
  for (const c of candidates) {
    const v = await verify(c, spec, { tscEntry });
    verdicts.push(v);
    process.stdout.write(v.passed ? "✓" : "✗");
  }
  process.stdout.write("\n");

  // Arms are only comparable on tasks that EVERY arm and the bare run produced
  // code for. A task lost to a refusal or a transient error in one arm is
  // dropped from all of them — otherwise an arm scores higher for having lost
  // its hardest task, which is what happened on the first run (2026-08-05:
  // full-setup "100" over 11 tasks vs bare 86 over 14, different 11).
  // Verify every trial of every arm, then compare only on tasks where the bare
  // run AND every arm produced code in ALL trials. A task missing anywhere is
  // dropped everywhere, so an arm can never score higher for having lost one.
  const passCount = async (trialsOf: Candidate[][], tag: string) => {
    const byTask = new Map<string, { pass: number; seen: number }>();
    for (let t = 0; t < trialsOf.length; t++) {
      process.stdout.write(`Verifying [${tag} t${t + 1}] `);
      for (const c of trialsOf[t]) {
        const v = await verify(c, spec, { tscEntry });
        const cur = byTask.get(c.taskId) ?? { pass: 0, seen: 0 };
        cur.seen++;
        if (v.passed) cur.pass++;
        byTask.set(c.taskId, cur);
        process.stdout.write(v.passed ? "✓" : "✗");
      }
      process.stdout.write("\n");
    }
    return byTask;
  };

  const armScores: ArmScore[] = [];
  if (withContext && spec.agentContext) {
    const bareBy = await passCount(bareTrials, "bare");
    const armBy = new Map<string, Map<string, { pass: number; seen: number }>>();
    for (const arm of spec.agentContext.arms) {
      const per = armCandidates.get(arm.name);
      if (per) armBy.set(arm.name, await passCount(per, arm.name));
    }

    // Each task yields one candidate per model per trial, so a complete cell is
    // trials x adapters — not trials. Caught by a two-model --fake run, where
    // the naive check matched nothing and silently compared on zero tasks.
    const perTask = trials * adapters.length;
    const complete = (m: Map<string, { pass: number; seen: number }>, id: string) =>
      m.get(id)?.seen === perTask;
    const comparable = [...bareBy.keys()].filter(
      (id) => complete(bareBy, id) && [...armBy.values()].every((m) => complete(m, id)),
    );
    const dropped = tasks.length - comparable.length;
    if (dropped > 0) {
      console.log(
        `\nComparing on ${comparable.length} of ${tasks.length} tasks — ${dropped} incomplete in at least one arm`,
      );
    }
    const cells = comparable.length * perTask;
    const barePass = comparable.reduce((n, id) => n + (bareBy.get(id)?.pass ?? 0), 0);
    const baselineScore = cells ? Math.round((100 * barePass) / cells) : 0;

    for (const arm of spec.agentContext.arms) {
      const m = armBy.get(arm.name);
      if (!m) continue;
      const passed = comparable.reduce((n, id) => n + (m.get(id)?.pass ?? 0), 0);
      const sc = cells ? Math.round((100 * passed) / cells) : 0;
      armScores.push({
        name: arm.name,
        label: arm.label,
        passed,
        total: cells,
        score: sc,
        baselineScore,
        delta: sc - baselineScore,
        comparedOn: comparable.length,
        trials,
        // Majority-of-trials, so a single flaky run does not read as "fixed".
        fixed: comparable.filter(
          (id) => (m.get(id)!.pass) * 2 > trials && (bareBy.get(id)!.pass) * 2 <= trials,
        ),
        failed: comparable.filter((id) => (m.get(id)!.pass) * 2 <= trials),
      });
    }
  }

  const result = score(spec.id, await libVersion(spec.packageName), new Date().toISOString(), verdicts, refusals, armScores);
  await writeFile(
    path.join(projectRoot, "data", `${label}.result.json`),
    JSON.stringify(result, null, 2),
  );

  const md = renderScorecard(result, spec);
  await mkdir(path.join(projectRoot, "scorecards"), { recursive: true });
  const cardPath = path.join(projectRoot, "scorecards", `${label}.md`);
  await writeFile(cardPath, md);

  console.log(`\nOverall: ${result.overallScore}/100`);
  for (const m of result.perModel) {
    console.log(`  ${m.model}: ${m.score}/100 (${m.passed}/${m.total})`);
  }
  if (result.failurePatterns.length) {
    console.log(`\nTop failure patterns:`);
    for (const p of result.failurePatterns) console.log(`  ${p.category}: ${p.count}×`);
  }
  console.log(`\nScorecard → ${cardPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
