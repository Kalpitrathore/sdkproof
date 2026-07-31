/**
 * EXPERIMENT (2026-07-31) — does Prisma's shipped agent skill close the v7
 * client-construction gap?
 *
 * Two arms, same tasks, same model, same fixture:
 *   bare   — today's prompt: task + docsHint + skeleton. No project context.
 *   skills — same, plus the `prisma-client-api` skill pack that `prisma init`
 *            installs from Prisma 7.9 (SKILL.md + references/constructor.md).
 *
 * Result (claude-opus-5, 3 tasks x 3 trials, 2026-07-31):
 *   bare 0/9  ->  client-api 2/9  ->  full-setup 7/9
 * i.e. the skills work, but the pack an agent routes to by name is the weakest;
 * what carries the result is prisma7-client.md and upgrade-v7/driver-adapters.md.
 *
 * To get a skills dir: run `prisma init` with prisma>=7.9 in a scratch project,
 * then point --skills-dir at the generated `.agents/skills`.
 *
 *   npx tsx scripts/exp-skills.ts --trials 3 --skills-dir /tmp/probe/.agents/skills
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { projectRoot, tscEntry } from "../src/env.ts";
import { prismaSpec } from "../src/libraries/prisma.ts";
import { anthropicAdapter } from "../src/models/anthropic.ts";
import { GENERATION_SYSTEM, buildUserPrompt, extractCode } from "../src/prompt.ts";
import { verify } from "../src/verify.ts";
import type { Task } from "../src/types.ts";

// The three client-construction tasks — the entire measured failure surface.
const TASKS: Task[] = [
  {
    id: "construct-client",
    area: "setup",
    difficulty: "medium",
    prompt:
      "Create and configure a PrismaClient instance, then export an async function `run()` that returns all users via findMany.",
    skeleton:
      'import { PrismaClient } from "@prisma/client";\n\n// Create a PrismaClient instance yourself, then export an async run() returning all users.\n',
  },
  {
    id: "construct-with-url",
    area: "setup",
    difficulty: "medium",
    prompt:
      "Create a PrismaClient that connects using the DATABASE_URL environment variable, then export an async function `run()` that returns all users.",
    skeleton:
      'import { PrismaClient } from "@prisma/client";\n\n// Create a PrismaClient configured to use process.env.DATABASE_URL, then export an async run() returning all users.\n',
  },
  {
    id: "construct-and-disconnect",
    area: "setup",
    difficulty: "medium",
    prompt:
      "Create a PrismaClient, export an async function `run()` that fetches all users and then disconnects the client before returning them.",
    skeleton:
      'import { PrismaClient } from "@prisma/client";\n\n// Create a PrismaClient, then export an async run() that fetches all users and disconnects.\n',
  },
];

/**
 * The published GENERATION_SYSTEM ends with "do NOT construct the client
 * yourself" — which directly contradicts these three tasks. Both arms use the
 * clause stripped so the measurement is of model knowledge, not of a
 * self-inflicted instruction conflict.
 */
const SYSTEM_FIXED = GENERATION_SYSTEM.replace(
  "Keep the provided imports and the `declare const prisma` line exactly as given; do NOT construct the client yourself. ",
  "",
);

/**
 * Arms differ only in how much of the installed skill tree reaches the prompt.
 * "client-api" is the pack an agent routing on skill *name* would pick for
 * "construct a PrismaClient"; "full-setup" adds the v7 setup/upgrade docs that
 * state the adapter requirement flatly. The gap between them is the finding.
 */
const ARMS: Array<{ name: string; files: string[] }> = [
  { name: "bare", files: [] },
  {
    name: "client-api",
    files: ["prisma-client-api/SKILL.md", "prisma-client-api/references/constructor.md"],
  },
  {
    name: "full-setup",
    files: [
      "prisma-client-api/SKILL.md",
      "prisma-client-api/references/constructor.md",
      "prisma-postgres-setup/references/prisma7-client.md",
      "prisma-upgrade-v7/references/driver-adapters.md",
      "prisma-upgrade-v7/references/removed-features.md",
    ],
  },
];

async function loadSkills(dir: string, files: string[]): Promise<string> {
  const parts: string[] = [];
  for (const rel of files) {
    const f = path.join(dir, ...rel.split("/"));
    parts.push(`--- ${rel} ---\n${await readFile(f, "utf8")}`);
  }
  return parts.join("\n\n");
}

async function main() {
  process.loadEnvFile(path.join(projectRoot, ".env"));

  const argv = process.argv.slice(2);
  const trials = Number(argv[argv.indexOf("--trials") + 1]) || 3;
  const skillsDir = argv[argv.indexOf("--skills-dir") + 1];
  if (!skillsDir) throw new Error("pass --skills-dir <path to .agents/skills>");

  const model = anthropicAdapter();
  const skillText: Record<string, string> = {};
  for (const arm of ARMS) skillText[arm.name] = await loadSkills(skillsDir, arm.files);
  console.log(`model=${model.id} trials=${trials}`);
  for (const arm of ARMS) console.log(`  ${arm.name}: ${skillText[arm.name].length} chars`);
  console.log("");

  const rows: Array<{
    arm: string;
    taskId: string;
    trial: number;
    passed: boolean;
    errors: string;
    code: string;
  }> = [];

  for (const { name: arm } of ARMS) {
    for (const task of TASKS) {
      for (let t = 1; t <= trials; t++) {
        const base = buildUserPrompt(task, prismaSpec);
        const ctx = skillText[arm];
        const user = ctx
          ? `Project context — agent skills installed by \`prisma init\`:\n\n${ctx}\n\n---\n\n${base}`
          : base;

        const raw = await model.generate({ system: SYSTEM_FIXED, user });
        const code = extractCode(raw);
        const verdict = await verify(
          { taskId: task.id, model: model.id, code },
          prismaSpec,
          { tscEntry },
        );
        rows.push({
          arm,
          taskId: task.id,
          trial: t,
          passed: verdict.passed,
          errors: verdict.errors.map((e) => `${e.code}: ${e.message}`).join(" | "),
          code,
        });
        console.log(
          `${arm.padEnd(6)} ${task.id.padEnd(24)} t${t} ${verdict.passed ? "✅ PASS" : "❌ FAIL"}  ${verdict.errors[0]?.code ?? ""} ${verdict.errors[0]?.message?.slice(0, 90) ?? ""}`,
        );
      }
    }
    console.log("");
  }

  const tally = (arm: string) => {
    const r = rows.filter((x) => x.arm === arm);
    return `${r.filter((x) => x.passed).length}/${r.length}`;
  };
  console.log("=".repeat(60));
  for (const { name } of ARMS) console.log(`${name.padEnd(12)} ${tally(name)}`);
  console.log("=".repeat(60));

  const outDir = path.join(projectRoot, "data");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, "exp-skills.result.json"),
    JSON.stringify({ model: model.id, trials, rows }, null, 2),
  );
  console.log("\nwrote data/exp-skills.result.json");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
