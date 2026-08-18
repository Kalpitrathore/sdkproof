# Vercel AI SDK — AI-Readiness Scorecard

**Library:** `ai` v7.0.30  
**Generated:** 2026-08-18T05:21:15.903Z  
**Method:** type-check only — measures whether agent-generated code uses the real, current API surface. Not a runtime test.

## Overall: 71/100

**Conditional API correctness** = passes / completions that produced code. **Unconditional task success** = passes / every task asked, refusals included. Ranges are Wilson 95% intervals.

| Model | Conditional | Unconditional | Passed | Scored | Refused |
|---|---:|---:|---:|---:|---:|
| claude-opus-5 | 71% (45.4–88.3%) | 71% (45.4–88.3%) | 10 | 14 | — |

_No task was refused, so both rates run over the same set of tasks._

## Top failure patterns

### deprecated-or-removed — 4×

```
Module '"ai"' has no exported member 'TelemetrySettings'.
```
_claude-opus-5 on task `typed-telemetry-config`_

### other — 11×

```
Binding element 'text' implicitly has an 'any' type.
```
_claude-opus-5 on task `extract-onfinish-handler`_

