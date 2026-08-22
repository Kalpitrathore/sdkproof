import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ModelAdapter } from "./core/model.ts";
import { FatalApiError, RefusalError } from "./core/model.ts";
import type { Candidate, LostTask, Refusal, Task, Verdict } from "./core/types.ts";
import { buildUserPrompt, extractCode, GENERATION_SYSTEM } from "./core/prompt.ts";
import { score } from "./core/score.ts";
import { verify } from "./core/verify.ts";
import { computeDrift, driftVerdict, type DriftReport } from "./drift.ts";
import { fetchPackument, readmeFor, resolveVersion } from "./registry.ts";
import { readmeOf } from "./surface.ts";
import { renderMarkdown, renderTerminal, type RunContext } from "./report.ts";
import { loadTaskFile, synthesizeTasks, type TaskSet } from "./tasks.ts";
import { prepareWorkspace, resolveTsc } from "./workspace.ts";

export interface RunOptions {
  /** `zod`, `zod@4`, `@tanstack/react-table@9.1.2` */
  spec: string;
  /** adapters for the models under test */
  adapters: ModelAdapter[];
  /** the model that writes the task set; defaults to the first adapter */
  taskModel?: ModelAdapter;
  taskCount: number;
  tasksFile?: string;
  limit?: number;
  concurrency: number;
  maxTokens?: number;
  fresh?: boolean;
  allowScripts?: boolean;
  /** re-synthesize tasks even if a cached set exists */
  noTaskCache?: boolean;
  tscEntry?: string;
  outDir?: string;
  log: (line: string) => void;
}

export interface RunOutcome {
  terminal: string;
  markdown: string;
  json: string;
  /** true when at least one candidate failed to compile */
  foundSomething: boolean;
  /** true when tasks were lost to transport errors — the run is not publishable */
  incomplete: boolean;
}

/** Split `@scope/name@version` without mangling the scope's leading `@`. */
export function parseSpec(spec: string): { name: string; version?: string } {
  const at = spec.lastIndexOf("@");
  if (at > 0) return { name: spec.slice(0, at), version: spec.slice(at + 1) };
  return { name: spec };
}

/**
 * Bounded concurrency. Firing every task at once produced 14 timeouts on a
 * 135-request run, and a lost task is worse than a slow one — it silently
 * shrinks the denominator.
 */
async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}

export async function run(opts: RunOptions): Promise<RunOutcome> {
  const { log } = opts;
  const { name, version: wanted } = parseSpec(opts.spec);

  const packument = await fetchPackument(name);
  const version = resolveVersion(packument, wanted);
  const meta = packument.versions[version];
  if (!meta) throw new Error(`${name}@${version} is not on the registry`);
  if (meta.deprecated) log(`Note: ${name}@${version} is deprecated — "${meta.deprecated}"`);
  log(`Target: ${name}@${version}`);

  const tscEntry = resolveTsc(opts.tscEntry);
  const ws = await prepareWorkspace({
    packageName: name,
    version,
    meta,
    fresh: opts.fresh,
    allowScripts: opts.allowScripts,
    tscEntry,
    log,
  });

  // The drift surface costs no API call and is the thing a maintainer reads
  // first, so it is computed even when the scored run finds nothing. A package
  // with a single major has nothing to diff, which is not an error.
  let drift: DriftReport | undefined;
  try {
    drift = await computeDrift(packument);
    log(`Drift: v${drift.from.major} -> v${drift.to.major} — ${driftVerdict(drift).reason}`);
  } catch (e) {
    log(`Drift: skipped (${(e as Error).message})`);
  }

  const taskModel = opts.taskModel ?? opts.adapters[0];
  let taskSet: TaskSet;
  if (opts.tasksFile) {
    taskSet = await loadTaskFile(opts.tasksFile, name);
    log(`Tasks: ${taskSet.tasks.length} from ${opts.tasksFile}`);
  } else {
    const readme = (await readmeOf(packument, version).catch(() => "")) || readmeFor(packument, version);
    // Plenty of packages ship a badge wall that links out to a docs site. The
    // tasks are still written, but they lean on what the model already knows
    // about the package rather than on anything version-accurate — and for a
    // package the model has never seen, that is worth saying out loud.
    if (readme.length < 1500) {
      log(`Note: ${name}@${version} ships a ${readme.length}-character README — the tasks lean on the model's own knowledge of it`);
    }
    taskSet = await synthesizeTasks({
      packageName: name,
      version,
      description: meta.description ?? packument.description ?? "",
      readme,
      count: opts.taskCount,
      model: taskModel,
      cache: !opts.noTaskCache,
      log,
    });
  }
  let tasks: Task[] = taskSet.tasks;
  if (opts.limit && opts.limit > 0) tasks = tasks.slice(0, opts.limit);
  if (!tasks.length) throw new Error("no tasks to run");
  if (taskSet.rejected.length) {
    log(`Tasks: ${taskSet.rejected.length} rejected (${taskSet.rejected.map((r) => r.id).join(", ")})`);
  }

  const promptTarget = {
    displayName: name,
    packageName: name,
    docsHint: taskSet.docsHint,
  };

  log("");
  // Progress goes to stderr, with the rest of the logging: --json writes the
  // result to stdout and a progress dot in the middle of it is not JSON.
  process.stderr.write(`Generating ${tasks.length} x ${opts.adapters.length} `);
  const candidates: Candidate[] = [];
  // A refusal is an UNMEASURED task, not a failed one — the model never wrote
  // code, so nothing about the library was tested.
  const refusals: Refusal[] = [];
  // A generation error is NOT a refusal — the model never said no, the request
  // never landed. Tracked so a truncated run cannot present itself as a whole one.
  const lost: LostTask[] = [];
  const jobs = opts.adapters.flatMap((m) => tasks.map((t) => ({ m, t })));
  await pool(jobs, opts.concurrency, async ({ m, t }) => {
    try {
      const raw = await m.generate({
        system: GENERATION_SYSTEM,
        user: buildUserPrompt(t, promptTarget),
        maxTokens: opts.maxTokens,
      });
      candidates.push({ taskId: t.id, model: m.id, code: extractCode(raw) });
      process.stderr.write(".");
    } catch (e) {
      if (e instanceof FatalApiError) throw e;
      if (e instanceof RefusalError) {
        refusals.push({ taskId: t.id, model: m.id, attempts: e.attempts });
        process.stderr.write("R");
      } else {
        lost.push({
          taskId: t.id,
          model: m.id,
          reason: String((e as Error).message).split("\n")[0].slice(0, 120),
        });
        process.stderr.write("!");
      }
    }
  });
  process.stderr.write("\n");

  if (lost.length) {
    log("");
    log(`INCOMPLETE RUN — ${lost.length}/${jobs.length} tasks never generated: ${[...new Set(lost.map((l) => l.taskId))].join(", ")}`);
    log("  These are NOT refusals. The denominator shrank, so this score is over a partial set.");
    log("  Do not publish it. Re-run when the API is healthy.");
  }
  if (refusals.length) {
    log(`Refused: ${refusals.length}/${jobs.length} — ${[...new Set(refusals.map((r) => r.taskId))].join(", ")}`);
    log("  (unmeasured, not counted as drift)");
  }

  // Verify sequentially — every candidate is written to the same candidate.ts.
  process.stderr.write("Verifying  ");
  const verdicts: Verdict[] = [];
  for (const c of candidates) {
    const v = await verify(
      c,
      { packageName: name, fixtureDir: ws.dir, candidateFile: ws.candidateFile },
      { tscEntry },
    );
    verdicts.push(v);
    process.stderr.write(v.passed ? "✓" : "✗");
  }
  process.stderr.write("\n");

  const result = score(name, version, new Date().toISOString(), verdicts, refusals, [], lost);
  const ctx: RunContext = {
    packageName: name,
    version,
    taskSet,
    drift,
    extraInstalls: ws.extraInstalls,
  };

  const outcome: RunOutcome = {
    terminal: renderTerminal(result, ctx),
    markdown: renderMarkdown(result, ctx),
    json: JSON.stringify({ ...result, drift, tasks, candidates }, null, 2),
    foundSomething: verdicts.some((v) => !v.passed),
    incomplete: lost.length > 0,
  };

  if (opts.outDir) {
    const dir = path.resolve(opts.outDir);
    await mkdir(dir, { recursive: true });
    const base = `${name.replace(/[@/]/g, "_")}@${version}`;
    await writeFile(path.join(dir, `${base}.md`), outcome.markdown);
    await writeFile(path.join(dir, `${base}.json`), outcome.json);
    log(`\nWrote ${path.join(dir, `${base}.md`)}`);
    log(`Wrote ${path.join(dir, `${base}.json`)}`);
  }

  return outcome;
}
