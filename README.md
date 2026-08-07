<p align="center">
  <img src="docs/logo.png" alt="SDKProof" width="360">
</p>

<p align="center">
  <a href="https://github.com/Kalpitrathore/sdkproof/stargazers"><img src="https://img.shields.io/github/stars/Kalpitrathore/sdkproof?style=social" alt="GitHub stars"></a>
  &nbsp;
  <a href="https://sdkproof.dev"><img src="https://img.shields.io/badge/live-sdkproof.dev-0e9aa7" alt="Live site"></a>
  &nbsp;
  <img src="https://img.shields.io/github/license/Kalpitrathore/sdkproof?color=888" alt="license">
</p>

# SDKProof

**Live:** https://sdkproof.dev

**How ready is your SDK for AI coding agents?** When a library ships a breaking
major, AI assistants keep writing the *old* API — it looks right, but it doesn't
compile against the new version. SDKProof measures exactly how much: it has a
model solve real tasks, then **type-checks the generated code against your real
installed package** (`tsc --noEmit`). Pass = compiles clean. No LLM judge — the
compiler decides.

## The board so far

| SDK | Package | claude-opus-5 | The gap |
|-----|---------|:---:|---------|
| **Prisma 7** | `@prisma/client` | **87 / 100** | still writes v6 client setup — omits v7's required driver `adapter`, uses the removed `datasourceUrl` |
| **Next.js 16** | `next` | **92 / 100** | misses Next 16's new 2-arg `revalidateTag()` — but nails the Next 15 async APIs |
| **React Router 8** | `react-router` | **93 / 100** | drops the deleted `json()` and `defer()` unprompted, but `meta()` still takes the removed `data` arg — now `loaderData` |
| **Stripe 22** | `stripe` | **100 / 100** | clean on every task that ran — but the model refused 5 of 15 outright, so this covers 10 |
| **Vercel AI SDK 7** | `ai` | **100 / 100** | clean sweep — now wires tools the v7 way (`inputSchema`, `stopWhen`). Was 90 on Opus 4.8 |
| **Zod 4** | `zod` | **100 / 100** | clean sweep — the new 2-arg `z.record()` and unified `error`. Was 90 on Opus 4.8 |
| **TanStack Query 5** | `@tanstack/react-query` | **100 / 100** | fully absorbed — every v4→v5 trap navigated |

**The pattern:** it isn't how *recently* the SDK changed, it's how much warning
the ecosystem had. TanStack Query v5 (2023) is fully absorbed (100), and the 2025
majors (Zod, the Vercel AI SDK) are too — Opus 5 closed the gaps Opus 4.8 still
had (90 → 100). React Router 8 is the newest major here and still scores 93,
because v8 mostly finished removals v7 had already deprecated — years of "stop
using this" signal to learn from. The misses cluster on changes that landed with
no deprecation runway: Prisma 7's now-required driver `adapter` (87), Next 16's
2-arg `revalidateTag()` (92), React Router's `meta()` rename. The gap re-opens on
every major and shifts on every model release, so it's worth *monitoring*, not
auditing once.

> **⭐ Star the repo** to get each new scorecard — or [**request one**](https://github.com/Kalpitrathore/sdkproof/issues/new?template=request-a-scorecard.yml): name any TypeScript package and it'll go on the board.

## For maintainers — put your score in your README

Every scored library gets a badge. One line of markdown, and it links back to the
full scorecard so anyone can check the number instead of taking it on faith:

[![SDKProof: 100/100](https://sdkproof.dev/badge/zod.svg)](https://sdkproof.dev/zod.html?ref=badge)

```markdown
[![SDKProof: 100/100](https://sdkproof.dev/badge/zod.svg)](https://sdkproof.dev/zod.html?ref=badge)
```

**All six badges, plus a shields.io endpoint:** <https://sdkproof.dev/badge.html>

Two things worth knowing before you embed it. **The score can go down** — it's
re-measured when a new model ships or your library ships a breaking major, and
the badge follows the run. And **it measures the model, not your library**: a low
score usually means your newest major is too recent for the training data, which
isn't a defect in your code.

Scores are also published as JSON at <https://sdkproof.dev/scores.json>.

## Beyond the score: does your documentation actually reach the model?

A score tells a maintainer how well models know their API — which they cannot
change. The more useful question is whether the docs they *ship* close the gap.

```bash
npm start -- run --lib prisma --with-context --trials 3
```

Scores the same tasks twice: bare, and with the library's own agent files in
context. The delta is the part a maintainer can act on.

**What that turned up, measured across three libraries** ([full method and
numbers](https://sdkproof.dev/agent-docs.html)):

- A **short sentence** quoted from a library's own docs fixes the failure it
  names — **9–10 times out of 10**.
- The **same sentence inside that library's own documentation** fixes nothing.
  React Router's sits at line 182 of `framework-mode.md`; there it works 0/10.
- **It is not length.** 25 KB of *unrelated* documentation leaves the fix
  working (8/10). 7.3 KB of the library's *own routing docs* destroys it (0/10).
  What crowds out a correction is the amount of same-domain material around it.

Each scorecard then derives its own fix list from those measurements — see
["What would move this number"](https://sdkproof.dev/prisma7.html). Rules, not a
model: an item without a measurement behind it is never emitted.

**Also surveyed:** what nine TypeScript libraries actually publish for coding
agents. Same filename, sizes from 2 KB to 5.7 MB, and no agreement on whether
`llms.txt` is documentation or a list of links to it.
→ [sdkproof.dev/agent-docs.html](https://sdkproof.dev/agent-docs.html)

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
npm start -- run --lib prisma     # or: aisdk, zod, tanstack-query, nextjs, react-router, stripe
npm start -- run --lib tanstack-query
npm start -- run --lib nextjs
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
  libraries/          LibrarySpec per SDK (prisma, aisdk, zod, tanstack-query, nextjs, react-router, stripe)
  context.ts          loads a library's own agent docs for --with-context
  recommend.ts        measurements -> a maintainer's fix list
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
