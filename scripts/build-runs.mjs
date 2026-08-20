/**
 * Emits docs/runs.json — the per-task detail behind every score.
 *
 * The site has always shown the headline number and hidden the evidence. This
 * exposes what was actually asked, which tasks compiled, and the real compiler
 * diagnostic for the ones that did not, so a reader can check the claim instead
 * of trusting it. Everything here is already-published measurement output; no
 * candidate source, no prompts to the model beyond the task description, no keys.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(root, "data");

// Only libraries the site actually publishes a board row for. Experiment runs
// (exp-*, nx-*, pr-*, rr-*, *-drift) are internal and stay out.
const PUBLISHED = {
  "react-table": { name: "TanStack React Table 9", pkg: "@tanstack/react-table" },
  aisdk: { name: "Vercel AI SDK 7", pkg: "ai" },
  prisma7: { name: "Prisma 7", pkg: "@prisma/client" },
  nextjs: { name: "Next.js 16", pkg: "next" },
  "react-router": { name: "React Router 8", pkg: "react-router" },
  stripe: { name: "Stripe 22", pkg: "stripe" },
  "tanstack-query": { name: "TanStack Query 5", pkg: "@tanstack/react-query" },
  zod: { name: "Zod 4", pkg: "zod" },
};

const CATEGORY_LABEL = {
  "deprecated-or-removed": "wrote an API this version removed",
  "hallucinated-member": "used a property or method that does not exist",
  "wrong-arguments": "called it with the wrong arguments",
  "type-mismatch": "passed the wrong type",
  "bad-import": "imported from a path that does not exist",
  other: "other compiler error",
};

const libs = [];
for (const [id, meta] of Object.entries(PUBLISHED)) {
  const resPath = path.join(DATA, `${id}.result.json`);
  const taskPath = path.join(DATA, `${id}.tasks.json`);
  if (!existsSync(resPath)) continue;
  const result = JSON.parse(readFileSync(resPath, "utf8"));
  const tasks = existsSync(taskPath) ? JSON.parse(readFileSync(taskPath, "utf8")) : [];
  const byId = new Map(tasks.map((t) => [t.id, t]));

  const rows = result.verdicts.map((v) => {
    const t = byId.get(v.taskId);
    // The first library-related error is the interesting one; a failed import
    // cascades into implicit-any noise that says nothing about the API.
    const e = v.errors.find((x) => x.libraryRelated) ?? v.errors[0] ?? null;
    return {
      task: v.taskId,
      asked: t?.prompt ?? null,
      area: t?.area ?? null,
      passed: v.passed,
      code: e?.code ?? null,
      message: e?.message ?? null,
    };
  });

  libs.push({
    id,
    name: meta.name,
    pkg: meta.pkg,
    version: result.libraryVersion,
    score: result.overallScore,
    compiled: rows.filter((r) => r.passed).length,
    total: rows.length,
    refused: (result.refusals ?? []).length,
    lost: (result.lost ?? []).length,
    ranAt: result.generatedAt.slice(0, 10),
    model: result.perModel?.[0]?.model ?? null,
    patterns: (result.failurePatterns ?? []).map((p) => ({
      category: p.category,
      label: CATEGORY_LABEL[p.category] ?? p.category,
      count: p.count,
    })),
    tasks: rows,
  });
}

libs.sort((a, b) => a.score - b.score);
const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  method: "Each task is given to the model once. The answer is written into a project with the real package installed and compiled with tsc. A task passes only if it compiles clean.",
  libraries: libs,
};
writeFileSync(path.join(root, "docs", "runs.json"), JSON.stringify(out));
const totalTasks = libs.reduce((n, l) => n + l.total, 0);
console.log(`Built docs/runs.json — ${libs.length} libraries, ${totalTasks} tasks with their compiler output`);
