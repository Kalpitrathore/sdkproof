# Prisma — AI-Readiness Scorecard

**Library:** `@prisma/client` v7.8.0  
**Generated:** 2026-07-17T04:43:53.914Z  
**Method:** type-check only — measures whether agent-generated code uses the real, current API surface. Not a runtime test.

## Overall: 80/100

| Model | Score | Passed | Total |
|---|---:|---:|---:|
| claude-opus-4-8 | 80/100 | 12 | 15 |

## Top failure patterns

### hallucinated-member — 2×

```
Property '$use' does not exist on type 'PrismaClient'.
```
_claude-opus-4-8 on task `query-logging-middleware`_

### other — 2×

```
Parameter 'params' implicitly has an 'any' type.
```
_claude-opus-4-8 on task `query-logging-middleware`_

### wrong-arguments — 1×

```
Expected 1 arguments, but got 0.
```
_claude-opus-4-8 on task `construct-client`_

