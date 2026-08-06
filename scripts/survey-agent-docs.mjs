// Surveys what libraries actually publish for AI coding agents, and whether a
// model could use it without a retrieval step.
//
// Why: SDKProof measures whether a model writes a library's current API. The
// obvious fix a maintainer reaches for is "ship docs for agents". This checks
// what that means in practice — and as of 2026-08-06, almost none of it is
// usable by a model that cannot fetch URLs.
//
//   node scripts/survey-agent-docs.mjs           # writes data/agent-docs.json
//   node scripts/survey-agent-docs.mjs --print   # and prints a table
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { projectRoot } from "../src/env.ts";

const LIBS = [
  { name: "Prisma", docs: "prisma.io", scored: "prisma7.html" },
  { name: "Next.js", docs: "nextjs.org", extra: ["nextjs.org/docs/llms.txt"], scored: "nextjs.html" },
  { name: "React Router", docs: "reactrouter.com", scored: "react-router.html" },
  { name: "Vercel AI SDK", docs: "ai-sdk.dev", scored: "aisdk.html" },
  { name: "Zod", docs: "zod.dev", scored: "zod.html" },
  { name: "TanStack Query", docs: "tanstack.com", scored: "tanstack-query.html" },
  { name: "Stripe", docs: "docs.stripe.com", scored: "stripe.html" },
  { name: "Drizzle ORM", docs: "orm.drizzle.team" },
  { name: "tRPC", docs: "trpc.io" },
];

/** A file is a link index if most of its non-empty lines carry a markdown link. */
function shape(text) {
  const lines = text.split("\n").filter((l) => l.trim());
  if (!lines.length) return { lines: 0, linkLines: 0, linkPct: 0 };
  const linkLines = lines.filter((l) => /\]\(https?:/.test(l)).length;
  return { lines: lines.length, linkLines, linkPct: Math.round((100 * linkLines) / lines.length) };
}

async function probe(url) {
  try {
    const res = await fetch(`https://${url}`, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return { url, status: res.status, chars: 0 };
    const text = await res.text();
    // Some sites answer 200 with an HTML 404 page; treat markup as absent.
    if (/^\s*<(!doctype|html)/i.test(text)) return { url, status: 200, chars: 0, html: true };
    return { url, status: res.status, chars: text.length, ...shape(text) };
  } catch (e) {
    return { url, status: `error: ${e && e.message ? e.message : e}`, chars: 0 };
  }
}

const rows = [];
for (const lib of LIBS) {
  const targets = [`${lib.docs}/llms.txt`, `${lib.docs}/llms-full.txt`, ...(lib.extra ?? [])];
  const files = [];
  for (const t of targets) files.push(await probe(t));
  rows.push({ ...lib, files });
  process.stdout.write(".");
}
process.stdout.write("\n");

await mkdir(path.join(projectRoot, "data"), { recursive: true });
const out = { surveyedAt: new Date().toISOString().slice(0, 10), rows };
await writeFile(path.join(projectRoot, "data", "agent-docs.json"), JSON.stringify(out, null, 2) + "\n");

if (process.argv.includes("--print")) {
  for (const r of rows) {
    console.log(`\n${r.name}`);
    for (const f of r.files) {
      const got = f.chars ? `${f.chars.toLocaleString()} chars, ${f.linkPct}% link lines` : `absent (${f.html ? "html" : f.status})`;
      console.log(`  ${f.url.padEnd(34)} ${got}`);
    }
  }
}
console.log(`\ndata/agent-docs.json written (${out.surveyedAt})`);
