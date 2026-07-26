# Prisma — AI-Readiness Scorecard

**Library:** `@prisma/client` v7.8.0  
**Generated:** 2026-07-26T19:56:37.515Z  
**Method:** type-check only — measures whether agent-generated code uses the real, current API surface. Not a runtime test.

## Overall: 87/100

| Model | Score | Passed | Total |
|---|---:|---:|---:|
| claude-opus-5 | 87/100 | 13 | 15 |

## Top failure patterns

### wrong-arguments — 1×

```
Argument of type '{ log: ("error" | "warn")[]; }' is not assignable to parameter of type 'Subset<PrismaClientOptions, PrismaClientOptions>'.
```
_claude-opus-5 on task `construct-client`_

### hallucinated-member — 1×

```
Object literal may only specify known properties, and 'datasourceUrl' does not exist in type 'Subset<PrismaClientOptions, PrismaClientOptions>'.
```
_claude-opus-5 on task `construct-with-url`_

