# React Router — AI-Readiness Scorecard

**Library:** `react-router` v8.3.0  
**Generated:** 2026-08-06T14:08:08.693Z  
**Method:** type-check only — measures whether agent-generated code uses the real, current API surface. Not a runtime test.

## Overall: 93/100

**Conditional API correctness** = passes / completions that produced code. **Unconditional task success** = passes / every task asked, refusals included. Ranges are Wilson 95% intervals.

| Model | Conditional | Unconditional | Passed | Scored | Refused |
|---|---:|---:|---:|---:|---:|
| claude-opus-5 | 93% (70.2–98.8%) | 93% (70.2–98.8%) | 14 | 15 | — |

_No task was refused, so both rates run over the same set of tasks._

## With the library's own agent context

Same tasks, same model. The bare score above is a project with no agent context; each arm below adds the files this library ships for itself.

Compared on the **15 tasks every arm produced code for**, 3 trial(s) each (45 runs per arm). A task missing from any arm is dropped from all of them, so an arm cannot score higher for having lost one. "Fixes" and "still fails" are majority-of-trials.

| Arm | Score | Passed | Scored | vs bare |
|---|---:|---:|---:|---:|
| bare | 91/100 | 41 | 45 | — |
| skill-only | 93/100 | 42 | 45 | **+2** |
| full-pack | 91/100 | 41 | 45 | **0** |

- `skill-only` — SKILL.md alone — what an agent routing by name would load first
  - still fails: `meta-from-loader`
- `full-pack` — plus the four mode references, one of which names the meta rename
  - still fails: `meta-from-loader`

## Top failure patterns

### hallucinated-member — 1×

```
Property 'data' does not exist on type 'MetaArgs<() => Promise<{ user: { id: string; name: string; } | null; }>, Record<string, unknown>>'.
```
_claude-opus-5 on task `meta-from-loader`_

