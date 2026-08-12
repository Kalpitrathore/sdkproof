# Apollo Client — AI-Readiness Scorecard

**Library:** `@apollo/client` v4.2.11  
**Generated:** 2026-08-12T04:22:04.612Z  
**Method:** type-check only — measures whether agent-generated code uses the real, current API surface. Not a runtime test.

## Overall: 20/100

**Conditional API correctness** = passes / completions that produced code. **Unconditional task success** = passes / every task asked, refusals included. Ranges are Wilson 95% intervals.

| Model | Conditional | Unconditional | Passed | Scored | Refused |
|---|---:|---:|---:|---:|---:|
| claude-opus-5 | 20% (3.6–62.4%) | 20% (3.6–62.4%) | 1 | 5 | — |

_No task was refused, so both rates run over the same set of tasks._

## Top failure patterns

### other — 4×

```
Module '"@apollo/client"' has no exported member 'useQuery'.
```
_claude-opus-5 on task `use-query-hook`_

