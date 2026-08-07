# Where these came from

`revalidate-tag.md` is nextjs.org's own published Markdown for the revalidateTag
API reference, fetched 2026-08-07 from
https://nextjs.org/docs/app/api-reference/functions/revalidateTag.md — 6,634 bytes.
Next.js serves a `.md` alongside every docs page; the HTML equivalent is 490 KB.

`minimal.md` is one sentence built from the signature line inside that same file.
Nothing is paraphrased away from what Next.js states.

**Why this library matters for the size question.** The React Router and Prisma
arms compared ~100 bytes against ~25 KB. This one sits between them at 6.6 KB, so
it tests whether a mid-sized document still works — turning "smaller is better"
into something closer to a threshold.
