#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { FatalApiError } from "./core/model.ts";
import { computeDrift, driftVerdict } from "./drift.ts";
import {
  adapterFor,
  defaultAdapters,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_MODEL,
  hasKeyFor,
  parseModelRef,
} from "./models.ts";
import { fetchPackument, resolveVersion } from "./registry.ts";
import { renderDrift } from "./report.ts";
import { parseSpec, run } from "./run.ts";

const require_ = createRequire(import.meta.url);

function version(): string {
  try {
    return JSON.parse(readFileSync(require_.resolve("../package.json"), "utf8")).version;
  } catch {
    return "0.0.0";
  }
}

const HELP = `
sdkproof — does the code an AI writes for this package actually compile?

USAGE
  npx sdkproof <package>[@version]      score a package
  npx sdkproof drift <package>          what its latest major removed (no API key needed)

HOW A RUN WORKS
  1. installs the package into a throwaway sandbox
  2. writes small, realistic coding tasks from that version's own README
  3. asks the model to solve them, with no hints about the API surface
  4. compiles every answer against the real installed package with tsc

  Pass = it compiles. No model judges another model.

OPTIONS
  --model <id>          model under test; repeatable. Accepts claude-*, gpt-*,
                        or an explicit anthropic:<id> / openai:<id>.
                        Default: every provider you have a key for.
  --task-model <id>     model that writes the tasks (default: the first --model)
  --tasks <file>        use a task file instead of writing one
  --task-count <n>      how many tasks to write (default 12)
  --limit <n>           run only the first n tasks
  --concurrency <n>     generations in flight (default 5; drop it if the API 429s)
  --max-tokens <n>      per-generation cap (default 16000)
  --out <dir>           write <package>@<version>.md and .json there
  --json                print the raw result JSON instead of the report
  --markdown            print the markdown report instead of the terminal one
  --no-task-cache       re-write the tasks even if this version has a cached set
  --fresh               reinstall the sandbox instead of reusing the cached one
  --allow-scripts       run npm lifecycle scripts during install (off by default)
  --tsc <path>          use a different tsc entrypoint
  --from <v> --to <v>   drift: compare two specific versions
  -h, --help            this
  -v, --version         print the version

KEYS
  ANTHROPIC_API_KEY or ANTHROPIC_AUTH_TOKEN, and/or OPENAI_API_KEY.
  A .env in the current directory is loaded if present.
  \`drift\` needs no key at all.

EXAMPLES
  npx sdkproof zod
  npx sdkproof @tanstack/react-table@9 --model claude-opus-5 --out ./reports
  npx sdkproof drift @apollo/client
`;

interface Flags {
  positional: string[];
  values: Map<string, string[]>;
  bools: Set<string>;
}

const VALUE_FLAGS = new Set([
  "--model", "--task-model", "--tasks", "--task-count", "--limit",
  "--concurrency", "--max-tokens", "--out", "--tsc", "--from", "--to",
]);

function parseArgs(argv: string[]): Flags {
  const positional: string[] = [];
  const values = new Map<string, string[]>();
  const bools = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("-")) {
      positional.push(a);
      continue;
    }
    if (VALUE_FLAGS.has(a)) {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      values.set(a, [...(values.get(a) ?? []), v]);
      continue;
    }
    bools.add(a);
  }
  return { positional, values, bools };
}

const num = (f: Flags, name: string, fallback: number): number => {
  const raw = f.values.get(name)?.[0];
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number, got "${raw}"`);
  return Math.floor(n);
};

async function main(): Promise<number> {
  // A .env beside the user's project is where an API key usually already lives.
  try {
    process.loadEnvFile?.(path.join(process.cwd(), ".env"));
  } catch {
    // no .env — use the ambient environment
  }

  const flags = parseArgs(process.argv.slice(2));
  // Checked before the help fallback: `--version` carries no positional, and
  // the fallback would otherwise answer it with the whole help text.
  if (flags.bools.has("-v") || flags.bools.has("--version")) {
    console.log(version());
    return 0;
  }
  const askedForHelp = flags.bools.has("-h") || flags.bools.has("--help");
  if (askedForHelp || !flags.positional.length) {
    console.log(HELP.trim());
    return askedForHelp ? 0 : 1;
  }

  const log = (line: string) => console.error(line);

  if (flags.positional[0] === "drift") {
    const target = flags.positional[1];
    if (!target) throw new Error("drift needs a package name: npx sdkproof drift <package>");
    const { name, version: wanted } = parseSpec(target);
    const packument = await fetchPackument(name);
    const d = await computeDrift(packument, {
      from: flags.values.get("--from")?.[0],
      to: flags.values.get("--to")?.[0] ?? (wanted ? resolveVersion(packument, wanted) : undefined),
    });
    if (flags.bools.has("--json")) {
      console.log(JSON.stringify({ ...d, verdict: driftVerdict(d) }, null, 2));
    } else {
      console.log(renderDrift(d, driftVerdict(d)));
    }
    return 0;
  }

  const modelFlags = flags.values.get("--model") ?? [];
  const adapters = modelFlags.length
    ? modelFlags.map((m) => {
        const ref = parseModelRef(m);
        if (!hasKeyFor(ref.provider)) {
          throw new Error(
            ref.provider === "anthropic"
              ? `--model ${m} needs ANTHROPIC_API_KEY (or ANTHROPIC_AUTH_TOKEN) in the environment`
              : `--model ${m} needs OPENAI_API_KEY in the environment`,
          );
        }
        return adapterFor(ref);
      })
    : defaultAdapters();

  if (!adapters.length) {
    console.error(
      [
        "No model API key found.",
        "",
        "  export ANTHROPIC_API_KEY=...     scores " + DEFAULT_ANTHROPIC_MODEL,
        "  export OPENAI_API_KEY=...        scores " + DEFAULT_OPENAI_MODEL,
        "",
        "Or run the part that needs no key:",
        `  npx sdkproof drift ${flags.positional[0]}`,
      ].join("\n"),
    );
    return 1;
  }

  const taskModelFlag = flags.values.get("--task-model")?.[0];
  const outcome = await run({
    spec: flags.positional[0],
    adapters,
    taskModel: taskModelFlag ? adapterFor(parseModelRef(taskModelFlag)) : undefined,
    taskCount: num(flags, "--task-count", 12),
    tasksFile: flags.values.get("--tasks")?.[0],
    limit: flags.values.get("--limit") ? num(flags, "--limit", 0) : undefined,
    concurrency: num(flags, "--concurrency", 5),
    maxTokens: flags.values.get("--max-tokens") ? num(flags, "--max-tokens", 16000) : undefined,
    fresh: flags.bools.has("--fresh"),
    allowScripts: flags.bools.has("--allow-scripts"),
    noTaskCache: flags.bools.has("--no-task-cache"),
    tscEntry: flags.values.get("--tsc")?.[0],
    outDir: flags.values.get("--out")?.[0],
    log,
  });

  if (flags.bools.has("--json")) console.log(outcome.json);
  else if (flags.bools.has("--markdown")) console.log(outcome.markdown);
  else console.log(outcome.terminal);

  // An incomplete run is not a result. Exiting non-zero keeps it out of CI
  // dashboards that would otherwise publish a score built on a shrunk denominator.
  return outcome.incomplete ? 3 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    if (e instanceof FatalApiError) {
      console.error(`\nRUN ABORTED — ${e.message}`);
      console.error("Nothing further was attempted. Fix the account, then re-run.");
      process.exit(2);
    }
    console.error(`\nsdkproof: ${(e as Error).message}`);
    process.exit(1);
  });
