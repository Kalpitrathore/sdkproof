# sdkproof

`npx sdkproof zod` asks a model to write small realistic jobs against a package, then compiles every answer against the real installed package with `tsc`, the TypeScript compiler. Pass = it compiles. No model judges another model.

You need an API key for the model you want to score. The other half of the tool, `npx sdkproof drift <package>`, needs no key at all.

## What a run looks like

```
$ npx sdkproof @tanstack/react-table --model claude-sonnet-5 --limit 3

Target: @tanstack/react-table@9.1.2
Drift: v8 -> v9 — 40 functions, hooks and classes gone from the entrypoint with no deprecation first, in a major that is 1 months old
Generating 3 x 1 ...
Verifying  ✗✗✗

────────────────────────────────────────────────────────────
  @tanstack/react-table@9.1.2 — 0 of 3 answers compiled
────────────────────────────────────────────────────────────

  claude-sonnet-5           0/3   compiled  (0%, 95% CI 0–56.1%)

  WHAT BROKE

  basic-people-table  (core, easy)
    TS2724: '"@tanstack/react-table"' has no exported member named 'getCoreRowModel'. Did you mean 'createCoreRowModel'?
    +6 more diagnostics

  sortable-product-headers  (sorting, easy)
    TS2724: '"@tanstack/react-table"' has no exported member named 'useReactTable'. Did you mean 'ReactTable'?
    +7 more diagnostics

  global-search-employees  (filtering, medium)
    TS2724: '"@tanstack/react-table"' has no exported member named 'useReactTable'. Did you mean 'ReactTable'?
    +7 more diagnostics

  FAILURE PATTERNS
    deprecated-or-removed    8x
    wrong-arguments          3x
    other                    12x
```

That is a real run on 22 Aug 2026, trimmed at the last line. `TS2724` is the compiler saying "this import doesn't exist, did you mean this other thing".

TanStack Table v9 renamed `useReactTable` to `useTable` & renamed the whole row-model family, so `getCoreRowModel` became `createCoreRowModel`. The model still writes v8 from memory. It looks right and it doesn't compile.

## What it measures, and what it doesn't

It measures **the model**, not the library. A 0 of 3 says the model has not caught up with v9 yet. It says nothing about whether v9 is a good release.

The one real limit: it type-checks, it doesn't run anything. Code that compiles can still be wrong at runtime. That is on purpose — a type error against the real installed package is a fact the compiler produced, and anything softer would be one AI grading another, which is the thing this exists to avoid.

## Use it

```bash
npx sdkproof <package>            # score it
npx sdkproof drift <package>      # what its latest major removed, no API key
```

Keys, in the environment or a `.env` in the current directory:

```bash
export ANTHROPIC_API_KEY=...      # scores claude-opus-5 by default
export OPENAI_API_KEY=...         # scores gpt-5 by default
```

Both set = both get scored on the same tasks, side by side.

```bash
npx sdkproof zod
npx sdkproof @apollo/client@3 --model claude-opus-5 --model gpt-5
npx sdkproof next --task-count 20 --out ./reports
npx sdkproof drift @tanstack/react-table
```

## Check whether it's worth scoring first

`drift` reads two published versions straight off npm and diffs the type declarations. No install, no model, no key, a few seconds.

```
$ npx sdkproof drift @apollo/client

────────────────────────────────────────────────────────────
  @apollo/client  v3.14.1 -> v4.2.12
────────────────────────────────────────────────────────────

  v4 landed 12 months ago
  132 exported symbols -> 133  (entry-only diff)

  WHAT LEFT (24) — functions, hooks and classes gone from the entrypoint with no deprecation first
  This is what a model trained on v3 will still write.

    ApolloConsumer
    ApolloProvider
    createQueryPreloader
    getApolloContext
    useApolloClient
    useLazyQuery
    useMutation
    useQuery
    useSubscription
    useSuspenseQuery
    ...

  Deprecated first, then removed (8) — these rarely produce drift:
    ApolloError, fromError, fromPromise, isApolloError, parser, resetApolloContext, throwServerError, toPromise

  (29 type-only export(s) also left the entrypoint. They are listed in --json; a model writes a hook far more often than it writes a type name.)

  WORTH SCORING — 24 functions, hooks and classes gone from the entrypoint with no deprecation first, in a major that is 12 months old
```

Apollo Client 4 moved its React hooks to a different import path, which is why `useQuery` reads as gone from the package root. That's the drift a model hits: the import it writes from memory no longer resolves.

Three things narrow that list, all measured across 35 libraries:

- **Values before types.** A model writes a hook far more often than it writes a type name, so the 29 removed type aliases sit behind the 24 callables.
- **A removal that was deprecated first produces almost no drift.** The deprecation is a signal in the training data; a silent removal isn't. Apollo's eight deprecated-then-removed symbols are separated out for that reason.
- **The window closes.** How old the major is predicts drift better than how big it was. Apollo v4 scored 0 of 12 once it had been out long enough, & zustand v5 was fully absorbed by about 19 months.

## How a run works

1. Installs the package into a throwaway sandbox under `~/.cache/sdkproof`. Lifecycle scripts are off unless you pass `--allow-scripts`.
2. Writes 12 small coding tasks from that exact version's own README.
3. Asks the model to solve them, with no hints about the API surface.
4. Compiles every answer against the real installed package and reports what broke.

Step 2 has two rules the tool enforces rather than requests. A task skeleton may not import from the package under test, and neither the task nor its skeleton may name an export of it. Hand the model `import { useTable }` and you have answered the hard half of the question before it starts. Tasks that break either rule are thrown away and counted in the output.

Tasks are cached per `package@version`, so a re-run scores the same set. `--no-task-cache` writes a fresh one.

## Options

```
--model <id>          model under test; repeatable. claude-*, gpt-*, or an
                      explicit anthropic:<id> / openai:<id>
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
```

## Things that will trip you up

**A package with no type declarations can't be scored.** There is nothing for the compiler to check against, and the run stops and says so.

**A refusal is not a failure.** If the model won't attempt a task, no code was written, so nothing about the library was measured. Refusals are reported separately and left out of the score.

**A lost task is worse than a slow one.** If generation errors out — an overloaded API, a timeout — the run prints `INCOMPLETE RUN` and exits 3. A partial run that loses the hard tasks scores higher than the real one, so don't publish that number.

**A thin README makes weak tasks.** Plenty of packages ship a badge wall that links out to a docs site. The tasks then lean on what the model already knows about the package. The run says so when it happens.

## In a script

```ts
import { run, computeDrift, driftVerdict, fetchPackument, anthropicAdapter } from "sdkproof";

// Check the cheap thing first — no model call, no install.
const packument = await fetchPackument("@apollo/client");
const verdict = driftVerdict(await computeDrift(packument));
if (!verdict.worth) {
  console.log(`skipping: ${verdict.reason}`);
} else {
  const out = await run({
    spec: "@apollo/client",
    adapters: [anthropicAdapter("claude-opus-5")],
    taskCount: 12,
    concurrency: 5,
    log: console.error,
  });
  console.log(out.markdown);
  if (out.incomplete) process.exit(3);
}
```

Exit codes: `0` fine, `1` bad arguments or a broken target, `2` the API key or account is dead, `3` the run lost tasks and is not publishable.

## Requirements

Node 20.12 or newer, `npm` on the PATH, and network access to the npm registry. One dependency: `typescript`.

MIT. Part of [SDKProof](https://sdkproof.dev) — [source](https://github.com/Kalpitrathore/sdkproof/tree/main/packages/cli).
