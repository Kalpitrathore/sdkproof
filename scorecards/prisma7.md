# Prisma — AI-Readiness Scorecard

**Library:** `@prisma/client` v7.8.0  
**Generated:** 2026-08-05T06:44:48.555Z  
**Method:** type-check only — measures whether agent-generated code uses the real, current API surface. Not a runtime test.

## Overall: 87/100

| Model | Score | Passed | Scored | Refused |
|---|---:|---:|---:|---:|
| claude-opus-5 | 87/100 | 13 | 15 | — |

## With the library's own agent context

Same tasks, same model. The bare score above is a project with no agent context; each arm below adds the files this library ships for itself.

Compared on the **15 tasks every arm produced code for** — a task missing from any arm is dropped from all of them, so an arm cannot score higher for having lost one.

| Arm | Score | Passed | Scored | vs bare |
|---|---:|---:|---:|---:|
| bare | 87/100 | 13 | 15 | — |
| client-api | 87/100 | 13 | 15 | **0** |
| full-setup | 93/100 | 14 | 15 | **+6** |

- `client-api` — the pack an agent routes to by name for client construction
  - still fails: `construct-with-url`, `construct-client`
- `full-setup` — plus the v7 setup and upgrade docs that state the adapter requirement flatly
  - fixes: `construct-with-url`
  - still fails: `construct-client`

## Top failure patterns

### hallucinated-member — 1×

```
Object literal may only specify known properties, and 'datasourceUrl' does not exist in type 'Subset<PrismaClientOptions, PrismaClientOptions>'.
```
_claude-opus-5 on task `construct-with-url`_

### wrong-arguments — 1×

```
Argument of type '{ log: ("error" | "warn")[]; }' is not assignable to parameter of type 'Subset<PrismaClientOptions, PrismaClientOptions>'.
```
_claude-opus-5 on task `construct-client`_

