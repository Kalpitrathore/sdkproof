# Next.js — AI-Readiness Scorecard

**Library:** `next` v16.2.11  
**Generated:** 2026-08-07T08:22:03.699Z  
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
| only | 100/100 | 10 | 10 | **+100** |
| first-25k | 100/100 | 10 | 10 | **+100** |
| last-25k | 100/100 | 10 | 10 | **+100** |
| first-50k | 90/100 | 9 | 10 | **+90** |

- `only` — the sentence alone, 137 B
  - fixes: `revalidate-tag`
- `first-25k` — the same sentence first, then 25 KB of unrelated Next.js docs
  - fixes: `revalidate-tag`
- `last-25k` — the same 25 KB first, sentence last
  - fixes: `revalidate-tag`
- `first-50k` — sentence first, then 50 KB
  - fixes: `revalidate-tag`

## Top failure patterns

### wrong-arguments — 1×

```
Expected 2 arguments, but got 1.
```
_claude-opus-5 on task `revalidate-tag`_

