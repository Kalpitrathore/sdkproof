import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { prismaSpec } from "./libraries/prisma.ts";
import { projectRoot, tscEntry } from "./env.ts";
import { generate } from "./generate.ts";
import { verify } from "./verify.ts";
import { score } from "./score.ts";
import { renderScorecard } from "./report.ts";
import { activeAdapters } from "./models/index.ts";
import { fakeAdapters } from "./models/fake.ts";
import type { Candidate, LibrarySpec, Task, Verdict } from "./types.ts";

const SPECS: Record<string, LibrarySpec> = { prisma: prismaSpec };

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function libVersion(): Promise<string> {
  try {
    const p = path.join(projectRoot, "node_modules", "@prisma", "client", "package.json");
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
    console.error("usage: sdkproof run --lib <id> [--fake] [--limit N]");
    process.exit(1);
  }

  const libId = flag(argv, "--lib") ?? "prisma";
  const useFake = argv.includes("--fake");
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
  await Promise.all(
    adapters.flatMap((m) =>
      tasks.map(async (t) => {
        try {
          candidates.push(await generate(t, m, spec));
          process.stdout.write(".");
        } catch (e) {
          console.error(`\n  generate failed [${m.id}/${t.id}]: ${(e as Error).message}`);
        }
      }),
    ),
  );
  process.stdout.write("\n");

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

  const result = score(spec.id, await libVersion(), new Date().toISOString(), verdicts);
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
