# Prisma — AI-Readiness Scorecard

**Library:** `@prisma/client` v7.8.0  
**Generated:** 2026-07-16T19:36:40.432Z  
**Method:** type-check only — measures whether agent-generated code uses the real, current API surface. Not a runtime test.

## Overall: 0/100

| Model | Score | Passed | Total |
|---|---:|---:|---:|
| claude-opus-4-8 | 0/100 | 0 | 3 |

## Top failure patterns

### wrong-arguments — 2×

```
Expected 1 arguments, but got 0.
```
_claude-opus-4-8 on task `construct-client`_

### hallucinated-member — 1×

```
Object literal may only specify known properties, and 'datasources' does not exist in type 'Subset<PrismaClientOptions, PrismaClientOptions>'.
```
_claude-opus-4-8 on task `construct-with-url`_

