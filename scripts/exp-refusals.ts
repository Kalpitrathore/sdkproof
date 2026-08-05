/**
 * EXPERIMENT (2026-08-04) — how often does the model decline an ordinary SDK task?
 *
 * Found by accident: the first Stripe run scored 100/100 with four of fifteen
 * candidates empty. The cause was `stop_reason: "refusal"` — the API returns a
 * thinking block and no text, which the harness stored as an empty candidate and
 * verify() passed, because an empty file compiles clean.
 *
 * A first look gave 3 trials on 4 tasks. That is an anecdote. This measures a
 * rate, with a denominator and a control.
 *
 * Method: build the EXACT prompt the real pipeline builds — same
 * GENERATION_SYSTEM, same buildUserPrompt, same tasks — and call the API
 * directly, bypassing the adapter's refusal re-sampling, which exists to hide
 * this from scored runs and would hide it from the measurement too. Record
 * `stop_reason` and nothing else. No verification, no scoring.
 *
 * ALWAYS run a control library. "Stripe refuses 30%" means nothing on its own;
 * "Stripe refuses 30% where Zod refuses 0%" is the finding.
 *
 *   npx tsx scripts/exp-refusals.ts --libs stripe,zod --trials 10
 *   npx tsx scripts/exp-refusals.ts --libs stripe --trials 3 --dry-run
 *   npx tsx scripts/exp-refusals.ts --libs stripe --tasks data/stripe.refusal-ab.tasks.json --trials 10
 */
import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "../src/env.ts";
import { fmtInterval, wilson } from "../src/stats.ts";
import { GENERATION_SYSTEM, buildUserPrompt } from "../src/prompt.ts";
import { prismaSpec } from "../src/libraries/prisma.ts";
import { aisdkSpec } from "../src/libraries/aisdk.ts";
import { zodSpec } from "../src/libraries/zod.ts";
import { tanstackQuerySpec } from "../src/libraries/tanstack-query.ts";
import { nextjsSpec } from "../src/libraries/nextjs.ts";
import { reactRouterSpec } from "../src/libraries/react-router.ts";
import { stripeSpec } from "../src/libraries/stripe.ts";
import type { LibrarySpec, Task } from "../src/types.ts";

const SPECS: Record<string, LibrarySpec> = {
  prisma: prismaSpec,
  aisdk: aisdkSpec,
  zod: zodSpec,
  "tanstack-query": tanstackQuerySpec,
  nextjs: nextjsSpec,
  "react-router": reactRouterSpec,
  stripe: stripeSpec,
};

const MODEL = "claude-opus-5";
/** Keep well under the account's rate limit; this fans out to trials x tasks. */
const DEFAULT_CONCURRENCY = 5;

function flag(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

interface Record_ {
  lib: string;
  taskId: string;
  trial: number;
  stopReason: string | null;
  /** true when the response carried no text block at all — the empty-candidate case */
  emptyText: boolean;
  blockTypes: string;
}

async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await fn(items[i]);
    }
  });
  await Promise.all(workers);
}

const libs = (flag("libs", "stripe,zod") as string).split(",").map((s) => s.trim()).filter(Boolean);
const trials = Number(flag("trials", "10"));
const dryRun = process.argv.includes("--dry-run");
const concurrency = Number(flag("concurrency", String(DEFAULT_CONCURRENCY)));

for (const l of libs) {
  if (!SPECS[l]) {
    console.error(`unknown lib: ${l} (known: ${Object.keys(SPECS).join(", ")})`);
    process.exit(1);
  }
}

const jobs: { spec: LibrarySpec; task: Task; trial: number }[] = [];
for (const l of libs) {
  const spec = SPECS[l];
  // --tasks measures an A/B file without touching the live task set, so a prompt
  // rewrite can be tested before it is promoted. Used 2026-08-05 to falsify the
  // "add ownership context" fix.
  const tasksFile = flag("tasks") ?? path.join(projectRoot, "data", `${spec.id}.tasks.json`);
  const tasks: Task[] = JSON.parse(await readFile(tasksFile, "utf8"));
  for (const task of tasks) for (let t = 1; t <= trials; t++) jobs.push({ spec, task, trial: t });
}

console.log(`${libs.join(", ")} — ${trials} trials x tasks = ${jobs.length} requests on ${MODEL}, concurrency ${concurrency}`);
if (dryRun) {
  for (const l of libs) {
    console.log(`  ${l}: ${jobs.filter((j) => j.spec.id === l).length} requests`);
  }
  process.exit(0);
}

// Load .env the same way cli.ts does. Without this the SDK throws on every
// request — and the first version of this script counted those errors as
// "not refused", reporting a confident 0% that measured nothing. Same class of
// bug as the one this script exists to investigate.
try {
  process.loadEnvFile(path.join(projectRoot, ".env"));
} catch {
  // no .env — rely on the ambient environment
}

const client = new Anthropic();
const records: Record_[] = [];
let done = 0;

await pool(jobs, concurrency, async ({ spec, task, trial }) => {
  try {
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: GENERATION_SYSTEM,
      messages: [{ role: "user", content: buildUserPrompt(task, spec) }],
    });
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    records.push({
      lib: spec.id,
      taskId: task.id,
      trial,
      stopReason: res.stop_reason,
      emptyText: text.trim().length === 0,
      blockTypes: res.content.map((b) => b.type).join(","),
    });
  } catch (e) {
    records.push({
      lib: spec.id,
      taskId: task.id,
      trial,
      stopReason: `error:${(e as Error).message.slice(0, 60)}`,
      emptyText: true,
      blockTypes: "",
    });
  }
  done++;
  if (done % 10 === 0 || done === jobs.length) process.stdout.write(`\r  ${done}/${jobs.length}`);
});
process.stdout.write("\n\n");

const isRefusal = (r: Record_) => r.stopReason === "refusal";
const isError = (r: Record_) => (r.stopReason ?? "").startsWith("error:");

// Abort loudly rather than publish a percentage over a broken denominator.
const errorCount = records.filter(isError).length;
if (errorCount > records.length / 2) {
  console.error(`\n${errorCount}/${records.length} requests errored — measurement is void, not a 0% result.`);
  console.error(`  first: ${records.find(isError)?.stopReason}`);
  process.exit(1);
}

/** Every rate printed here carries its interval. Ten trials is ten trials. */
const summary = [];

for (const l of libs) {
  const forLib = records.filter((r) => r.lib === l);
  const errored = forLib.filter(isError).length;
  const valid = forLib.length - errored;
  const refused = forLib.filter(isRefusal).length;
  const pct = valid ? ((100 * refused) / valid).toFixed(1) : "n/a";
  // The denominator is VALID responses. An errored request measured nothing and
  // must never be counted as a non-refusal.
  const ci = valid ? ` 95% CI ${fmtInterval(wilson(refused, valid))}` : "";
  console.log(
    `${l} — ${refused}/${valid} refused (${pct}%)${ci}${errored ? `  [${errored} errored, excluded]` : ""}`,
  );

  const byTask = [...new Set(forLib.map((r) => r.taskId))]
    .map((id) => {
      const rows = forLib.filter((r) => r.taskId === id && !isError(r));
      return { id, refused: rows.filter(isRefusal).length, n: rows.length };
    })
    .sort((a, b) => b.refused - a.refused);

  // Per-task rows get intervals too, and the 0/n rows get printed rather than
  // summarised away. At n=10 a 0/10 row is consistent with a true rate near 30%
  // — reading it as "never refuses" is the same overclaim as reading 10/10 as
  // "always refuses". Both were on the published scorecard until 2026-08-06.
  for (const t of byTask) {
    const bar = "█".repeat(Math.round((10 * t.refused) / t.n)).padEnd(10, "·");
    const w = t.n ? wilson(t.refused, t.n) : null;
    console.log(
      `  ${t.id.padEnd(22)} ${String(t.refused).padStart(3)}/${t.n}  ${bar}  ${w ? fmtInterval(w) : "n/a"}`,
    );
  }
  console.log("");

  summary.push({
    lib: l,
    refused,
    valid,
    errored,
    rate: valid ? refused / valid : null,
    ci95: valid ? wilson(refused, valid) : null,
    byTask: byTask.map((t) => ({ ...t, ci95: t.n ? wilson(t.refused, t.n) : null })),
  });
}

// A refusal should be the ONLY way an empty candidate appears. If an empty text
// body ever shows up under stop_reason "end_turn", that is a second, unknown
// source of blank answers and it needs chasing before any score is trusted.
const oddEmpties = records.filter((r) => r.emptyText && !isRefusal(r) && !r.stopReason?.startsWith("error"));
if (oddEmpties.length) {
  console.log(`⚠️  ${oddEmpties.length} empty response(s) NOT explained by a refusal:`);
  for (const r of oddEmpties.slice(0, 5)) {
    console.log(`   ${r.lib}/${r.taskId} trial ${r.trial}: stop_reason=${r.stopReason} blocks=${r.blockTypes}`);
  }
}

await mkdir(path.join(projectRoot, "data"), { recursive: true });
// An A/B run (--tasks) gets its own output file. The first version wrote one
// fixed filename, so the 2026-08-05 paired A/B overwrote the 250-request
// baseline whose 62/150 the scorecard quotes — the numbers survived only
// because they were already on the page. Same shape as a --fake run clobbering
// a published score: a side experiment must not overwrite the run of record.
const tasksLabel = flag("tasks") ? `.${path.basename(flag("tasks")!).replace(/\.tasks\.json$/, "")}` : "";
const out = path.join(projectRoot, "data", `exp-refusals${tasksLabel}.result.json`);
await writeFile(
  out,
  JSON.stringify(
    {
      model: MODEL,
      trials,
      libs,
      // One attempt per trial, recorded so this can never be confused with the
      // scored pipeline, which re-samples a refused prompt up to 4x before
      // giving up. Those are two different systems and they produce two
      // different refusal rates; whichever number is quoted has to say which.
      attemptsPerTrial: 1,
      ranAt: new Date().toISOString(),
      summary,
      records,
    },
    null,
    2,
  ),
);
console.log(`raw → ${out}`);
