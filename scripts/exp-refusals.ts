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

for (const l of libs) {
  const forLib = records.filter((r) => r.lib === l);
  const errored = forLib.filter(isError).length;
  const valid = forLib.length - errored;
  const refused = forLib.filter(isRefusal).length;
  const pct = valid ? ((100 * refused) / valid).toFixed(1) : "n/a";
  // The denominator is VALID responses. An errored request measured nothing and
  // must never be counted as a non-refusal.
  console.log(`${l} — ${refused}/${valid} refused (${pct}%)${errored ? `  [${errored} errored, excluded]` : ""}`);

  const byTask = [...new Set(forLib.map((r) => r.taskId))]
    .map((id) => {
      const rows = forLib.filter((r) => r.taskId === id && !isError(r));
      return { id, refused: rows.filter(isRefusal).length, n: rows.length };
    })
    .sort((a, b) => b.refused - a.refused);

  for (const t of byTask) {
    if (t.refused === 0) continue;
    const bar = "█".repeat(Math.round((10 * t.refused) / t.n));
    console.log(`  ${t.id.padEnd(22)} ${String(t.refused).padStart(3)}/${t.n}  ${bar}`);
  }
  const clean = byTask.filter((t) => t.refused === 0).map((t) => t.id);
  if (clean.length) console.log(`  never refused (${clean.length}): ${clean.join(", ")}`);
  console.log("");
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
const out = path.join(projectRoot, "data", "exp-refusals.result.json");
await writeFile(
  out,
  JSON.stringify({ model: MODEL, trials, libs, ranAt: new Date().toISOString(), records }, null, 2),
);
console.log(`raw → ${out}`);
