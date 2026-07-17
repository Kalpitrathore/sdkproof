# SDKProof

Measures how well today's top coding models use a library's **real, current** API,
and reports a 0–100 score plus the exact API calls they get wrong. The public
"AI-readiness scorecards" it produces are both the product and the distribution engine.

See `SPEC.md` for the full design. This is **v1: prove the signal on one SDK (Prisma).**

## What it does

For each of ~10 curated Prisma tasks, it asks each model (Claude, GPT) to write a
TypeScript solution, then **type-checks that solution against the real installed
`@prisma/client`** inside a sandbox fixture. A solution passes if it compiles clean;
failures (hallucinated methods, wrong args, invented fields, deprecated APIs) are
classified and ranked. Type-check only — it measures API-surface correctness, not
runtime behaviour.

## Requirements

- **Node 20+.** This session set up a project-local Node at `../.tools/node` (add it
  to `PATH`, or install Node globally). Check with `node -v`.

## Setup

```bash
npm install
npm run setup      # prisma generate — creates fixtures/prisma/generated/
npm test           # 8 unit tests (verify / classify / score / extract)
```

## Run

Offline pipeline check (no API keys — two synthetic models, mixed scorecard):

```bash
npm start -- run --lib prisma --fake
```

Real scorecard — put your keys in a local `.env` (gitignored; the CLI loads it):

```bash
cp .env.example .env      # then edit .env and add ANTHROPIC_API_KEY
npm run score             # == run --lib prisma
```

Get an Anthropic key at https://console.anthropic.com (Billing → API Keys) — a run
costs a few cents. OpenAI is optional (only to also score GPT). Env vars work too if
you prefer them over `.env`.

Flags: `--fake` (offline), `--limit N` (first N tasks).

Outputs land in `scorecards/prisma.md` and `data/prisma.{candidates,result}.json`.

## The go/no-go for v1

Run it for real on Prisma, then **eyeball ~10 failures**: are they genuine API
mistakes a Prisma maintainer would nod at, and interesting enough to headline a
scorecard? If yes → scale to 5 SDKs + publish + Show HN. If they're mostly harness
noise → fix `verify` first.

## Layout

```
src/
  types.ts            shared types
  libraries/prisma.ts LibrarySpec for Prisma
  prompt.ts           generation prompt + code extraction
  generate.ts         (task × model) -> candidate
  verify.ts           type-check a candidate against the fixture   [load-bearing]
  classify.ts         tsc errors -> ranked failure patterns
  score.ts            verdicts -> Result
  report.ts           Result -> scorecard.md
  models/             anthropic / openai / fake adapters
  cli.ts              `sdkproof run --lib prisma`
fixtures/prisma/      schema.prisma, tsconfig, generated client
data/                 tasks.json (committed) + run outputs
scorecards/           prisma.md
test/                 unit tests
```
