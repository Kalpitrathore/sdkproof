# SDKProof

**Live:** https://kalpitrathore.github.io/sdkproof/

**How ready is your SDK for AI coding agents?** When a library ships a breaking
major, AI assistants keep writing the *old* API — it looks right, but it doesn't
compile against the new version. SDKProof measures exactly how much: it has a
model solve real tasks, then **type-checks the generated code against your real
installed package** (`tsc --noEmit`). Pass = compiles clean. No LLM judge — the
compiler decides.

## The board so far

| SDK | Package | claude-opus-4-8 | The gap |
|-----|---------|:---:|---------|
| **Prisma 7** | `@prisma/client` | **80 / 100** | still writes removed v6 setup — `new PrismaClient()`, `datasources`, `$use` |
| **Vercel AI SDK 7** | `ai` | **90 / 100** | old tool wiring — `parameters` (now `inputSchema`), removed `maxSteps` |
| **Zod 4** | `zod` | **90 / 100** | removed `required_error` (now `error`) — but nails the new 2-arg `z.record()` |

**The pattern:** readiness tracks how recently the SDK changed. AI SDK & Zod (2025
majors) are mostly absorbed; Prisma 7 (newer) isn't. The gap re-opens on every
major and shifts on every model release — so it's worth *monitoring*, not auditing
once.

## How it works

1. **Generate** — a model solves ~10–15 realistic tasks. Prompts name the functions, never the option names — so it measures what the model *reaches for*.
2. **Type-check** — each solution is written into a fixture with the real installed package and run through `tsc --noEmit`.
3. **Score** — pass = clean compile; failures are the compiler's own diagnostics, classified into failure patterns.

## Quick start

Requires **Node 20+** and a package manager.

```bash
npm install
npm run setup            # generates the Prisma fixture client (only needed for Prisma)
npm test                 # unit tests (verify / classify / score / extract)

# Try the pipeline offline — no API key needed (two synthetic models):
npm start -- run --lib prisma --fake
```

### Real scorecards

Put your key(s) in a local `.env` (gitignored):

```bash
cp .env.example .env     # then add ANTHROPIC_API_KEY
```

Get an Anthropic key at <https://console.anthropic.com> (a run costs a few cents).
OpenAI is optional — set `OPENAI_API_KEY` (+ `SDKPROOF_OPENAI_MODEL`) to also score GPT.

```bash
npm start -- run --lib prisma     # or: aisdk, zod
npm start -- run --lib aisdk
npm start -- run --lib zod
```

Outputs land in `scorecards/<lib>.md` and `data/<lib>.result.json`.
Flags: `--fake` (offline), `--limit N`, `--tasks <file>` (custom task set).

## Add your own SDK

1. `npm i <package>` and create `fixtures/<lib>/tsconfig.json` (see `fixtures/aisdk` for a plain package, `fixtures/prisma` for one needing codegen).
2. Add a `LibrarySpec` in `src/libraries/<lib>.ts` (the `docsHint` should name the functions but **not** the drift-prone option names).
3. Write `data/<lib>.tasks.json` — a mix of core tasks (should pass) and version-specific tasks (the drift).
4. Register it in `SPECS` in `src/cli.ts`, then `npm start -- run --lib <lib>`.

## Layout

```
src/
  types.ts            shared types
  libraries/          LibrarySpec per SDK (prisma, aisdk, zod)
  prompt.ts           generation prompt + code extraction
  generate.ts         (task × model) -> candidate
  verify.ts           type-check a candidate against the fixture   [load-bearing]
  classify.ts         tsc errors -> ranked failure patterns
  score.ts            verdicts -> Result
  report.ts           Result -> scorecard.md
  models/             anthropic / openai / fake adapters
  cli.ts              `sdkproof run --lib <id>`
fixtures/<lib>/       tsconfig + any generated client
data/                 <lib>.tasks.json (committed) + run outputs (gitignored)
scorecards/           per-SDK scorecards (.md + shareable .html)
test/                 unit tests
```

## Method notes

Type-check only — it measures whether the generated code uses the real, current
API surface, **not** whether it runs. Scores are directional; the clone/version
landscape moves, so re-verify before acting on any single result.

---

_Independent analysis. Scorecards are not affiliated with or endorsed by the libraries scored._
