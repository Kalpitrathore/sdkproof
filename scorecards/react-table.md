# TanStack React Table — AI-Readiness Scorecard

**Library:** `@tanstack/react-table` v9.1.2  
**Generated:** 2026-08-18T18:12:24.968Z  
**Method:** type-check only — measures whether agent-generated code uses the real, current API surface. Not a runtime test.

## Overall: 0/100

**Conditional API correctness** = passes / completions that produced code. **Unconditional task success** = passes / every task asked, refusals included. Ranges are Wilson 95% intervals.

| Model | Conditional | Unconditional | Passed | Scored | Refused |
|---|---:|---:|---:|---:|---:|
| claude-opus-5 | 0% (0–24.2%) | 0% (0–24.2%) | 0 | 12 | — |

_No task was refused, so both rates run over the same set of tasks._

## Top failure patterns

### deprecated-or-removed — 30×

```
'"@tanstack/react-table"' has no exported member named 'createTable'. Did you mean 'ReactTable'?
```
_claude-opus-5 on task `paginated-table`_

### type-mismatch — 12×

```
Type 'User' has no properties in common with type 'TableFeatures'.
```
_claude-opus-5 on task `typed-column-helper`_

### hallucinated-member — 3×

```
Object literal may only specify known properties, and 'enableSorting' does not exist in type 'ColumnDef<User, any>'.
```
_claude-opus-5 on task `sortable-table`_

### other — 68×

```
Expected 2 type arguments, but got 1.
```
_claude-opus-5 on task `typed-column-helper`_

