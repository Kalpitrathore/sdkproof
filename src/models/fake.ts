import type { ModelAdapter } from "./types.ts";

const HEADER = `import type { PrismaClient } from "@prisma/client";\ndeclare const prisma: PrismaClient;\n`;

/**
 * Deterministic offline adapters for testing the pipeline without API keys.
 * "fake-good" always emits a valid Prisma call; "fake-bad" always hallucinates
 * a `createOne` method with an invented field — so a `--fake` run exercises
 * generate → verify → classify → score → report end to end and produces a
 * realistic mixed scorecard.
 */
export function fakeAdapters(): ModelAdapter[] {
  const good: ModelAdapter = {
    id: "fake-good",
    async generate() {
      return "```ts\n" + HEADER +
        `export async function solve() {\n  return prisma.user.findMany({ where: { email: "a@b.com" } });\n}\n` +
        "```";
    },
  };
  const bad: ModelAdapter = {
    id: "fake-bad",
    async generate() {
      return "```ts\n" + HEADER +
        `export async function solve() {\n  return prisma.user.createOne({ data: { email: "a@b.com", nickname: "x" } });\n}\n` +
        "```";
    },
  };
  return [good, bad];
}
