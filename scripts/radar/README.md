# Radar — target discovery

Finds libraries whose recent major removed a **hand-written public API with no
deprecation runway**. Zero model API calls; everything here is npm metadata and
TypeScript declaration files.

## Why the ladder has five rungs

Each rung is cheaper than the one after it, and each has killed a real
candidate that the rung before it passed:

| rung | test | cost | killed here |
|---|---|---|---|
| 1 | Major shipped in the last ~12 months? | free | zustand (19mo) |
| 2 | Does the `.d.ts` diff show removals? | ~10s | motion (154 exports before and after) |
| 2b | **Are the symbol names hand-written?** | free | `@kubernetes/client-node`, `highcharts` |
| 3 | **Does the compiler agree they were public and are gone?** | ~60s | stagehand (263→0), kubo (145→0), react-plaid-link (20→0) |
| 4 | **Does the model actually write them?** | ~12 calls | `@angular/core`, `mobx-react` |

Only after rung 4 is a fixture worth building.

## Two things this tool is bad at, learned the hard way

**A `.d.ts` diff is a coarse net, not a measurement.** It has been wrong in both
directions on packages verified by hand: it read `react-plaid-link` as 20
removals (a bundled entry moved behind `export *`) and `react-router` as 109
(following `export *` into chunk files drags in internals — one reported symbol
was `$`). It is good at *surfacing* candidates and bad at *counting* them, which
is why rung 3 exists.

**A big number means a machine regenerated a type tree.** Every real finding so
far is 1–4 hand-named symbols — `useReactTable`, `AppLoadContext`,
`StreamTextOnFinishCallback`, `AppFactory`. Every 100+ result has been generated
churn or a false positive. Kubernetes generates from REST verbs
(`...RequestRequest`); Highcharts concatenates the options path
(`NavigationBindingsCircleAnnotationAnnotationsLabels...`). Different tells, same
worthlessness. **Read the results bottom-up.** The filter is: would a human type
this name from memory?

## Usage

```sh
node harvest.mjs                                  # npm search -> candidates.json
TOP_N=500 MAX_AGE_MONTHS=14 node radar.mjs        # rungs 1-2 -> radar-hits.json
node verify-removals.mjs                          # rung 3   -> verified.json
```

Rung 4 is a generation pre-test against the real prompt machinery — see the
per-library probes in the backlog.

`verified.json` is committed as the current output. `candidates.json`,
`stage1.json` and `radar-hits.json` are intermediates and are ignored.
