# Vercel AI SDK — AI-Readiness Scorecard

**Library:** `ai` v7.8.0  
**Generated:** 2026-07-17T06:18:47.994Z  
**Method:** type-check only — measures whether agent-generated code uses the real, current API surface. Not a runtime test.

## Overall: 90/100

| Model | Score | Passed | Total |
|---|---:|---:|---:|
| claude-opus-4-8 | 90/100 | 9 | 10 |

## Top failure patterns

### other — 2×

```
No overload matches this call.
```
_claude-opus-4-8 on task `tool-weather`_

### hallucinated-member — 1×

```
Object literal may only specify known properties, and 'maxSteps' does not exist in type 'LanguageModelCallOptions & RequestOptions<{ getWeather: ({ title?: string | undefined; providerOptions?: SharedV4ProviderOptions | undefined; ... 7 more ...; toModelOutput?: ((options: { ...; }) => PromiseLike<...> | ToolResultOutput) | undefined; } & { ...; } & { ...; } & { ...; } & { ...; }) | ({ ...; } & ... 3 mo...'.
```
_claude-opus-4-8 on task `tool-weather`_

