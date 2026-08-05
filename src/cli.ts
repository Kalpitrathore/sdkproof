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
    console.error("usage: sdkproof run --lib <id> [--fake] [--limit N] [--with-context]");
    process.exit(1);
  }

  const libId = flag(argv, "--lib") ?? "prisma";
  const useFake = argv.includes("--fake");
  const withContext = argv.includes("--with-context");
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
  const armCandidates = new Map<string, Candidate[]>();
  if (withContext) {
    if (!spec.agentContext) {
      console.error(`--with-context: ${spec.id} declares no agentContext`);
      process.exit(1);
    }
    const arms = await loadArms(spec.agentContext);
    console.log(`\nContext arms (${spec.agentContext.source}):`);
    for (const arm of spec.agentContext.arms) {
      console.log(`  ${arm.name}: ${arms.get(arm.name)!.length} chars — ${arm.label}`);
    }
    for (const arm of spec.agentContext.arms) {
      process.stdout.write(`Generating [${arm.name}] `);
      const got: Candidate[] = [];
      await Promise.all(
        adapters.flatMap((m) =>
          tasks.map(async (t) => {
            try {
              got.push(await generate(t, m, spec, arms.get(arm.name)));
              process.stdout.write(".");
            } catch (e) {
              if (e instanceof RefusalError) process.stdout.write("R");
              else console.error(`\n  generate failed [${arm.name}/${m.id}/${t.id}]: ${(e as Error).message}`);
            }
          }),
        ),
      );
      process.stdout.write("\n");
      armCandidates.set(arm.name, got);
      await mkdir(path.join(projectRoot, "data"), { recursive: true });
      await writeFile(
        path.join(projectRoot, "data", `${label}.arm-${arm.name}.candidates.json`),
        JSON.stringify(got, null, 2),
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
  const armVerdicts = new Map<string, Map<string, boolean>>();
  for (const arm of spec.agentContext?.arms ?? []) {
    const got = armCandidates.get(arm.name);
    if (!got) continue;
    process.stdout.write(`Verifying [${arm.name}] `);
    const byTask = new Map<string, boolean>();
    for (const c of got) {
      const v = await verify(c, spec, { tscEntry });
      byTask.set(c.taskId, v.passed);
      process.stdout.write(v.passed ? "✓" : "✗");
    }
    process.stdout.write("\n");
    armVerdicts.set(arm.name, byTask);
  }

  const armScores: ArmScore[] = [];
  if (armVerdicts.size) {
    const bareByTask = new Map(verdicts.map((v) => [v.taskId, v.passed]));
    const comparable = [...bareByTask.keys()].filter((id) =>
      [...armVerdicts.values()].every((m) => m.has(id)),
    );
    const dropped = tasks.length - comparable.length;
    if (dropped > 0) {
      console.log(
        `Comparing on ${comparable.length} of ${tasks.length} tasks — ${dropped} missing from at least one arm`,
      );
    }
    const barePassed = comparable.filter((id) => bareByTask.get(id)).length;
    const baselineScore = comparable.length
      ? Math.round((100 * barePassed) / comparable.length)
      : 0;
    for (const arm of spec.agentContext?.arms ?? []) {
      const m = armVerdicts.get(arm.name);
      if (!m) continue;
      const passed = comparable.filter((id) => m.get(id)).length;
      const s = comparable.length ? Math.round((100 * passed) / comparable.length) : 0;
      armScores.push({
        name: arm.name,
        label: arm.label,
        passed,
        total: comparable.length,
        score: s,
        baselineScore,
        delta: s - baselineScore,
        comparedOn: comparable.length,
        // The aggregate says the docs help. These say WHICH task they fixed and
        // which they did not, which is the only part a maintainer can act on.
        failed: comparable.filter((id) => !m.get(id)),
        fixed: comparable.filter((id) => m.get(id) && !bareByTask.get(id)),
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
