# Pipeline automation — design

**Date:** 2026-07-30
**Status:** approved, not yet implemented
**Scope:** internal batch tool. No web UI, no public endpoint, no untrusted input.

## Problem

Adding a library to SDKProof takes 1–2 hours of hand work: install the package, write a
fixture tsconfig, write a `LibrarySpec`, hand-author `data/<id>.tasks.json`, register it in
`SPECS`, run it, hand-build the scorecard HTML, add a board card.

Most of that time goes into one step — authoring the task file — because it requires knowing
which parts of the library's API actually changed in its recent major.

At that cost, emailing 50 maintainers a report about their own library is 50–100 hours of
work, which means it does not happen. The bottleneck for the outreach channel is report
generation, not finding addresses.

## Goals

1. Generate a scored report for a library from nothing but its npm package name.
2. Make the per-library cost minutes rather than hours, so batches of 5–10 are routine.
3. Keep the compiler as the only thing that makes a judgment. No LLM grades another LLM.
4. Produce an email-ready report that names a specific, true, checkable failure.

## Non-goals

- No public/self-serve scoring. Installing arbitrary packages from strangers needs real
  sandboxing and a job queue; that is a separate project.
- No auto-generated public scorecard pages. The five hand-built pages stay hand-built —
  their narrative quality is a large part of why maintainers engaged.
- No changes to how the existing five libraries are scored. Their published numbers have
  provenance and must not shift as a side effect of this work.

## Approach

Five new stages in front of the existing pipeline. `generate → verify → score` is untouched,
and `Task` / `Candidate` / `Verdict` / `Result` keep their current shapes, so generated task
files and hand-written ones remain interchangeable.

```
resolve → install → probe → taskgen → admit → [ generate → verify → score ] → report
                                                      existing, unchanged
```

Drift is discovered by **using tsc as the oracle** rather than by reading types
programmatically. This is forced by a hard constraint (below) and turns out to fit the
project's ethos anyway.

### Constraint: TypeScript 7 has no programmatic compiler API

Verified on the installed toolchain:

```
$ node -e "const ts=require('typescript'); console.log(ts.version, Object.keys(ts))"
7.0.2 [ 'version', 'versionMajorMinor' ]
$ ls node_modules/typescript/lib/
getExePath.d.ts  getExePath.js  tsc.js  version.cjs  version.d.cts
```

`createProgram`, `createCompilerHost`, `createSourceFile` and `TypeChecker` are all absent —
the package ships only the compiler binary. Any design that enumerates symbols via the
TypeScript API is not available without side-installing TypeScript 5, which this design
avoids.

## Architecture

### Workspace layout

Each library-version gets an isolated install. The root `package.json` returns to holding
only harness dependencies.

```
workspaces/
  zod@3.23.8/
    package.json          { "dependencies": { "zod": "3.23.8" } }   exact, no range
    tsconfig.json         candidate.ts only
    tsconfig.probe.json   probe.ts only
    node_modules/
    probe.ts              generated
  zod@4.4.3/
    …same…
    candidate.ts          written and deleted per verification
```

`workspaces/` is gitignored. Versions are pinned exactly so a re-run reproduces. Installs use
`npm install --ignore-scripts`: package selection is ours, so this is not a security boundary,
but postinstall scripts across a hundred libraries are a reliability problem.

**The existing five are not migrated.** `fixtures/prisma`, `fixtures/zod`, `fixtures/aisdk`,
`fixtures/tanstack-query` and `fixtures/nextjs` keep their tsconfigs and keep resolving from
the root `node_modules`. `LibrarySpec.fixtureDir` is already a free path, so a workspace is
simply another fixture directory.

### Modules

Six new files under `src/pipeline/`, each independently testable, none expected to exceed
~200 lines.

| Module | Responsibility | Depends on |
|---|---|---|
| `resolve.ts` | npm registry → old major, new major, release dates, drift-window age | network |
| `install.ts` | create workspace, write package.json + both tsconfigs, run npm | fs, npm |
| `probe.ts` | exported names from old `.d.ts` → drift points | tsc |
| `taskgen.ts` | drift points → `Task[]` + reference and legacy solutions | model adapter |
| `admit.ts` | compiler gate; keeps only discriminating tasks | tsc |
| `email-report.ts` | `Result` + drift → email-ready markdown | none |

### Change to existing code

`SPECS` in `src/cli.ts` stops being a hardcoded record. It becomes a lookup: the static map
of the five published libraries first, then a `workspaces/` directory match. This is the only
edit to existing source.

## Stage specifications

### resolve

Input: package name. Output: `{ packageName, newVersion, oldVersion, newMajorReleasedAt, windowMonths }`.

- `GET https://registry.npmjs.org/<pkg>` (scoped names URL-encoded: `@scope%2Fname`).
- `newVersion` = `dist-tags.latest`, ignoring prereleases.
- `oldVersion` = highest stable release whose major is `major(newVersion) - 1`.
- `newMajorReleasedAt` = `time[<major>.0.0]`.
- `windowMonths` = months between `newMajorReleasedAt` and now.

Add `semver` as an explicit dependency. It is currently present only transitively, which is
not a contract.

**Targeting rule.** Value is highest for recent majors, because the finding only exists while
models still write the previous surface. Observed on the existing board: 2025 majors
(Zod 4, AI SDK 7) are absorbed by Opus 5 and score 100; newer majors (Prisma 7, Next 16) still
fail. Three explicit buckets, recorded on the drift record:

| `windowMonths` | Bucket | Meaning |
|---|---|---|
| `<= 12` | `fresh` | Highest value — models are most likely to still write the old surface |
| `13–24` | `closing` | Worth scoring; expect partial absorption |
| `> 24` | `absorbed` | Low value — deprioritise in batch runs |

If there is no previous major, the library is not a drift candidate — status `no-major`.

### install

For each of the two versions: create `workspaces/<pkg>@<version>/`, write a `package.json`
pinning that exact version, write both tsconfigs from a template, run
`npm install --ignore-scripts`.

tsconfig template, derived from `fixtures/zod/tsconfig.json` plus the `types: ["node"]` fix
that stopped `process.env` producing false failures:

```json
{
  "compilerOptions": {
    "target": "ES2022", "module": "NodeNext", "moduleResolution": "NodeNext",
    "lib": ["ES2022"], "types": ["node"], "strict": true, "noEmit": true,
    "skipLibCheck": true, "esModuleInterop": true
  },
  "include": ["candidate.ts"]
}
```

`tsconfig.probe.json` is identical except `"include": ["probe.ts"]`. Two configs rather than
one so probing and verification never compile each other's files.

Install failure — peer dependency conflict, native build, private package — is status
`install-failed`.

### probe

Discovers removed and renamed exports. **One compile per version, not one per symbol.**

1. Collect exported names from the old version's type declarations: the `types`/`typings`
   entry plus any deep entry points declared in the package's `exports` map. Extraction is by
   pattern match over `export declare (const|function|class|type|interface|enum) <name>`,
   `export { A, B as C }`, and `export * from "./x"` (followed one level).
2. Emit `probe.ts` importing every collected name from the package root.
3. Compile against both versions with `tsc -p tsconfig.probe.json --pretty false`.
4. `tsc` emits one `TS2305: Module '"<pkg>"' has no exported member 'X'` per missing
   specifier, so a single run yields the whole missing-set.
5. `drift = {resolves against old} \ {resolves against new}`.

**Imprecise extraction is safe by construction.** A name that is not really exported fails
against *both* versions, never enters `{resolves against old}`, and cannot become a drift
point. A missed name costs one potential finding. The failure mode is silence, never a false
claim.

**Known limitation.** The probe finds removals and renames, not signature changes. A
constructor losing its zero-argument overload — the actual Prisma 7 finding — is invisible
here because the symbol still exists. This is covered downstream: `taskgen` receives both the
drift list *and* the library's main entry points as soft targets, so arity changes are still
exercised by the task run. The probe is a targeting aid, not the measurement.

Zero drift points is status `no-drift`: the library has no surface change to talk about and
should not be emailed.

### taskgen

Runs over two input sets: every drift point from the probe, plus **up to five primary entry
points** — symbols the authoring model selects as the library's main surface from the full
export list. The second set exists to catch signature and arity changes the probe cannot see.
Model judgment in the selection is acceptable because admission gates whatever it produces.

For each input the authoring model produces:

- a `Task` — `id`, `area`, `difficulty`, `prompt`, `skeleton` (existing shape, unchanged)
- a **reference solution** using the current API
- a **legacy solution** using the old API

It also derives `docsHint` for the `LibrarySpec`: name the library's main building blocks and
**exclude every symbol on the drift list**. That is the existing hand-authoring rule, made
mechanical.

### admit

The compiler gate. A task is admitted iff:

```
reference compiles clean against NEW   ∧   legacy fails against NEW
```

Tasks that fail either condition are discarded — they do not discriminate between the old and
new API and would score noise.

**The asymmetry that keeps scores honest.** The authoring model is *given the answer*: it sees
the drift point, the new signature, and the type surface. The scored model is given only
`docsHint`, exactly as today. Without this asymmetry, any task the authoring model could not
solve would be discarded, systematically removing the tasks that are hardest for models and
inflating every published score. With it, admission tests "is this task solvable at all,"
not "can a model guess it."

A drift point that yields no admissible task after two attempts is recorded as `unauthored`
and counted in the report, so a thin scorecard is visibly thin rather than looking clean.

Zero admissible tasks is status `no-tasks`.

### report

Two outputs. `data/<lib>.result.json` is produced by the existing `score` stage, unchanged.
`reports/<lib>.email.md` is new and built to the rules the outreach has already learned:

- open with what is measured, not with a score
- raw task counts (`9/10`), never `/100` — the scale means nothing to a cold reader
- name their real installed version
- quote the actual `tsc` diagnostic and the old→new code
- carry the deprecated-still-compiles caveat

If no specific failure can be named, the report does not render. An empty report is a library
that should not be emailed.

## Data artifacts

| Path | New | Contents |
|---|---|---|
| `workspaces/<pkg>@<ver>/` | yes | isolated install, gitignored, exact-pinned |
| `data/<lib>.drift.json` | yes | drift points, both versions, major release date, window age |
| `data/<lib>.tasks.json` | no | generated tasks, same format as hand-written |
| `data/<lib>.candidates.json` | no | unchanged |
| `data/<lib>.result.json` | no | unchanged |
| `reports/<lib>.email.md` | yes | outreach artifact |
| `data/libraries.json` | yes | registry of every library attempted, with status |

## Failure taxonomy

Every library ends in exactly one status in `data/libraries.json`. Nothing is swallowed —
the skip reasons are the target-list intelligence, and without them it is impossible to tell
"this library is clean" from "the pipeline broke."

| Status | Meaning | Action |
|---|---|---|
| `scored` | ran clean, report written | send it |
| `no-major` | never shipped a breaking major | never a candidate |
| `no-drift` | probe found nothing between majors | absorbed; nothing to say |
| `no-tasks` | drift found, nothing admissible | inspect by hand |
| `install-failed` | peer deps, native build, private package | a bug to fix |
| `partial` | model API errors mid-run | retry later |

Model API errors retry with backoff. Batch runs take a spend cap and a `--dry-run` flag: a
hundred libraries at ~10 tasks each is the first point at which cost is worth bounding.

## CLI surface

Existing `sdkproof run --lib <id> [--fake] [--limit N] [--tasks <file>]` is unchanged.

| Command | Does |
|---|---|
| `sdkproof add <pkg>` | Full chain for one package: resolve → install → probe → taskgen → admit → run → report |
| `sdkproof add <pkg> --stop-after <stage>` | Same, halting early — for inspecting drift before spending on generation |
| `sdkproof batch <file.json>` | Runs `add` over a list of packages, writing each result to `data/libraries.json` |
| `sdkproof batch <file.json> --dry-run` | resolve + probe only. No model calls, no spend. Reports which packages would be worth scoring |
| `sdkproof batch <file.json> --max-spend <usd>` | Halts the batch once estimated spend crosses the cap |
| `sdkproof prune [--days 30]` | Deletes `node_modules` from workspaces untouched for N days, default 30 |

`--dry-run` is the one to reach for first on a new batch: it answers "which of these 40
packages even have drift worth an email" for the cost of some npm metadata and two tsc runs
each.

## Operations

Disk is the real constraint at scale — 100–300MB per library-version install. `prune` removes
`node_modules` from workspaces untouched for 30 days (override with `--days`) while keeping
`package.json` and the manifest, so any pruned workspace is reproducible from its pinned
version.

Node is project-local at `~/Desktop/work/.tools/node`; it must be on `PATH` for `npm` calls.

## Testing

Existing 8 unit tests and `node --test` are unchanged.

New unit tests, targeting the places where a silent bug yields a plausible but wrong number:

- TS2305 set extraction from `tsc --pretty false` output
- old-major selection from a fixture registry payload, including scoped names and prereleases
- the admission predicate, both directions
- email-report rendering, including the "no specific failure → no report" path

**Offline integration test.** Two versions of a tiny dummy package in `test/fixtures/`, the
second with a deliberate export removal, installed from a `file:` path. Runs
`install → probe → taskgen → admit` end to end against the existing `--fake` model adapters:
no network, no API spend, deterministic. This is the test that makes the pipeline trustworthy
on library #47 rather than something to spot-check forever.

## Risks

| Risk | Mitigation |
|---|---|
| TS 7 has no compiler API | Design uses tsc as a subprocess oracle; no API needed |
| Probe misses signature/arity changes | Entry points passed to taskgen as soft targets; task run still catches them |
| Admission inflating scores | Author-sees-answer / scorer-does-not asymmetry |
| Export extraction imprecision | Self-correcting: false names fail on both versions and are dropped |
| Disk growth | `prune` command; exact pins make workspaces reproducible |
| Existing five scores shifting | They are not migrated and not touched |

## Out of scope, enabled later

This engine is the substrate for four things already on the backlog, none of which are built
here: the README badge, per-version score history, the CI gate, and self-serve scoring.
Per-version history in particular becomes nearly free — scoring two versions of one library is
the same code path as scoring two libraries.
