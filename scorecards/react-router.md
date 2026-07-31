# React Router — AI-Readiness Scorecard

**Library:** `react-router` v8.3.0  
**Generated:** 2026-07-31T08:59:34.123Z  
**Method:** type-check only — measures whether agent-generated code uses the real, current API surface. Not a runtime test.

## Overall: 93/100

| Model | Score | Passed | Total |
|---|---:|---:|---:|
| claude-opus-5 | 93/100 | 14 | 15 |

## Top failure patterns

### hallucinated-member — 1×

```
Property 'data' does not exist on type 'MetaArgs<() => Promise<{ user: { id: string; name: string; } | null; }>, Record<string, unknown>>'.
```
_claude-opus-5 on task `meta-from-loader`_

