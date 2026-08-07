# React Router — AI-Readiness Scorecard

**Library:** `react-router` v8.3.0  
**Generated:** 2026-08-07T08:48:01.019Z  
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
| metadata-only | 100/100 | 10 | 10 | **+100** |
| framework-only | 0/100 | 0 | 10 | **0** |
| full-pack | 0/100 | 0 | 10 | **0** |

- `just-the-line` — only the one sentence from framework-mode.md, ~75 characters
  - fixes: `meta-from-loader`
- `metadata-only` — just the Metadata section that contains it, 215 B
  - fixes: `meta-from-loader`
- `framework-only` — the whole file it lives in — 7.3 KB, all about routing
  - still fails: `meta-from-loader`
- `full-pack` — plus the four mode references, one of which names the meta rename
  - still fails: `meta-from-loader`

## Top failure patterns

### hallucinated-member — 1×

```
Property 'data' does not exist on type 'MetaArgs<() => Promise<{ user: { id: string; name: string; } | null; }>, Record<string, unknown>>'.
```
_claude-opus-5 on task `meta-from-loader`_

