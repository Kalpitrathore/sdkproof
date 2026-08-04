# Stripe — AI-Readiness Scorecard

**Library:** `stripe` v22.4.0  
**Generated:** 2026-08-04T18:13:11.770Z  
**Method:** type-check only — measures whether agent-generated code uses the real, current API surface. Not a runtime test.

## Overall: 100/100

| Model | Score | Passed | Scored | Refused |
|---|---:|---:|---:|---:|
| claude-opus-5 | 100/100 | 10 | 10 | 5 |

## ⚠️ 5 tasks refused — not measured

The model declined to write code for the following, after 4 attempts at the identical prompt. **These are excluded from the score above**: no code was produced, so nothing about the library was tested. A refusal is not evidence the API is hard to use, and it is not drift.

- `connect-account` — claude-opus-5
- `per-request-key` — claude-opus-5
- `subscription-create` — claude-opus-5
- `payment-intent` — claude-opus-5
- `auto-paginate` — claude-opus-5

**Read the score as covering 10 of 15 written tasks.**

_No failures — every model used the API correctly on every task._
