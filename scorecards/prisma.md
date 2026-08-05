# Prisma — AI-Readiness Scorecard

**Library:** `@prisma/client` v7.8.0  
**Generated:** 2026-08-05T06:59:55.035Z  
**Method:** type-check only — measures whether agent-generated code uses the real, current API surface. Not a runtime test.

## Overall: 50/100

| Model | Score | Passed | Scored | Refused |
|---|---:|---:|---:|---:|
| fake-bad | 0/100 | 0 | 2 | — |
| fake-good | 100/100 | 2 | 2 | — |

## With the library's own agent context

Same tasks, same model. The bare score above is a project with no agent context; each arm below adds the files this library ships for itself.

Compared on the **2 tasks every arm produced code for**, 2 trial(s) each (8 runs per arm). A task missing from any arm is dropped from all of them, so an arm cannot score higher for having lost one. "Fixes" and "still fails" are majority-of-trials.

| Arm | Score | Passed | Scored | vs bare |
|---|---:|---:|---:|---:|
| bare | 50/100 | 4 | 8 | — |
| client-api | 50/100 | 4 | 8 | **0** |
| full-setup | 50/100 | 4 | 8 | **0** |

- `client-api` — the pack an agent routes to by name for client construction
- `full-setup` — plus the v7 setup and upgrade docs that state the adapter requirement flatly

## Top failure patterns

### hallucinated-member — 2×

```
Property 'createOne' does not exist on type 'UserDelegate<DefaultArgs, { omit: GlobalOmitConfig | undefined; }>'. Did you mean 'create'?
```
_fake-bad on task `create-user`_

