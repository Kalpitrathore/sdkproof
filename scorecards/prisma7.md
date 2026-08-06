# Prisma — AI-Readiness Scorecard

**Library:** `@prisma/client` v7.8.0  
**Generated:** 2026-08-06T05:23:23.135Z  
**Method:** type-check only — measures whether agent-generated code uses the real, current API surface. Not a runtime test.

## Overall: 87/100

**Conditional API correctness** = passes / completions that produced code. **Unconditional task success** = passes / every task asked, refusals included. Ranges are Wilson 95% intervals.

| Model | Conditional | Unconditional | Passed | Scored | Refused |
|---|---:|---:|---:|---:|---:|
| claude-opus-5 | 87% (62.1–96.3%) | 87% (62.1–96.3%) | 13 | 15 | — |

_No task was refused, so both rates run over the same set of tasks._

## With the library's own agent context

Same tasks, same model. The bare score above is a project with no agent context; each arm below adds the files this library ships for itself.

Compared on the **15 tasks every arm produced code for**, 3 trial(s) each (45 runs per arm). A task missing from any arm is dropped from all of them, so an arm cannot score higher for having lost one. "Fixes" and "still fails" are majority-of-trials.

| Arm | Score | Passed | Scored | vs bare |
|---|---:|---:|---:|---:|
| bare | 87/100 | 39 | 45 | — |
| client-api | 87/100 | 39 | 45 | **0** |
| full-setup | 93/100 | 42 | 45 | **+6** |

- `client-api` — the pack an agent routes to by name for client construction
  - still fails: `construct-client`, `construct-with-url`
- `full-setup` — plus the v7 setup and upgrade docs that state the adapter requirement flatly
  - fixes: `construct-with-url`
  - still fails: `construct-client`

## Top failure patterns

### wrong-arguments — 1×

```
Argument of type '{ log: ("error" | "warn")[]; }' is not assignable to parameter of type 'Subset<PrismaClientOptions, PrismaClientOptions>'.
```
_claude-opus-5 on task `construct-client`_

### hallucinated-member — 1×

```
Object literal may only specify known properties, and 'datasourceUrl' does not exist in type 'Subset<PrismaClientOptions, PrismaClientOptions>'.
```
_claude-opus-5 on task `construct-with-url`_

