# Prisma — AI-Readiness Scorecard

**Library:** `@prisma/client` v7.8.0  
**Generated:** 2026-08-06T15:32:29.862Z  
**Method:** type-check only — measures whether agent-generated code uses the real, current API surface. Not a runtime test.

## Overall: 0/100

**Conditional API correctness** = passes / completions that produced code. **Unconditional task success** = passes / every task asked, refusals included. Ranges are Wilson 95% intervals.

| Model | Conditional | Unconditional | Passed | Scored | Refused |
|---|---:|---:|---:|---:|---:|
| claude-opus-5 | 0% (0–79.3%) | 0% (0–79.3%) | 0 | 1 | — |

_No task was refused, so both rates run over the same set of tasks._

## With the library's own agent context

Same tasks, same model. The bare score above is a project with no agent context; each arm below adds the files this library ships for itself.

Compared on the **1 tasks every arm produced code for**, 10 trial(s) each (10 runs per arm). A task missing from any arm is dropped from all of them, so an arm cannot score higher for having lost one. "Fixes" and "still fails" are majority-of-trials.

| Arm | Score | Passed | Scored | vs bare |
|---|---:|---:|---:|---:|
| bare | 0/100 | 0 | 10 | — |
| just-the-line | 100/100 | 10 | 10 | **+100** |
| client-api | 0/100 | 0 | 10 | **0** |
| full-setup | 50/100 | 5 | 10 | **+50** |

- `just-the-line` — only the adapter sentence from prisma7-client.md, ~170 characters
  - fixes: `construct-client`
- `client-api` — the pack an agent routes to by name for client construction
  - still fails: `construct-client`
- `full-setup` — plus the v7 setup and upgrade docs that state the adapter requirement flatly
  - still fails: `construct-client`

## Top failure patterns

### wrong-arguments — 1×

```
Argument of type '{ log: ("error" | "warn")[]; }' is not assignable to parameter of type 'Subset<PrismaClientOptions, PrismaClientOptions>'.
```
_claude-opus-5 on task `construct-client`_

