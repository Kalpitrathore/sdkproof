# Where these files came from — and what makes this different from Prisma

`remix-run/react-router`, `.agents/skills/react-router/` at the default branch,
fetched 2026-08-06. Only the user-facing pack is here; the other five skills in
that directory (`create-pr`, `fix-bug`, `implement-rfc`, `finish-line`,
`prepare-release-notes`) are contributor tooling and are not what a consumer of
the library would ever load.

**⚠️ These are NOT shipped to users.** They live in the repo. `npm i react-router`
does not install them, and `reactrouter.com/llms.txt` returns 404. Nothing here
reaches a developer using the library.

So this arm answers a different question from the Prisma one. Prisma's skills are
installed into your project by `prisma init`, so scoring them measures **what
their users actually get**. These measure **what React Router's users would get
if this content were published** — which is precisely the recommendation already
on their scorecard, tested rather than asserted.

The reason it is worth testing: `references/framework-mode.md` line 182 says
"Important: `meta` receives `loaderData`; do not use deprecated `data` args" —
the exact fix for the one task this library fails.
