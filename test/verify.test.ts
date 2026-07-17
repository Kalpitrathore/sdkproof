import { test } from "node:test";
import assert from "node:assert/strict";
import { verify, parseDiagnostics } from "../src/verify.ts";
import { prismaSpec } from "../src/libraries/prisma.ts";
import { tscEntry } from "../src/env.ts";
import type { Candidate } from "../src/types.ts";

test("parseDiagnostics keeps only candidate errors and flags API-shape codes", () => {
  const output = [
    "fixtures/prisma/candidate.ts(4,22): error TS2551: Property 'createOne' does not exist on type 'UserDelegate'. Did you mean 'create'?",
    "fixtures/prisma/generated/client/client.ts(1,1): error TS9999: noise from generated code",
  ].join("\n");
  const errs = parseDiagnostics(output, prismaSpec);
  assert.equal(errs.length, 1);
  assert.equal(errs[0].code, "TS2551");
  assert.equal(errs[0].line, 4);
  assert.equal(errs[0].libraryRelated, true);
});

const GOOD = `import type { PrismaClient } from "@prisma/client";
declare const prisma: PrismaClient;
export async function solve() {
  return prisma.user.create({
    data: { email: "a@b.com", name: "Ada", profile: { create: { bio: "hi" } } },
  });
}
`;

const HALLUCINATED = `import type { PrismaClient } from "@prisma/client";
declare const prisma: PrismaClient;
export async function solve() {
  return prisma.user.createOne({ data: { email: "a@b.com", nickname: "ada" } });
}
`;

test("verify passes a correct Prisma candidate", async () => {
  const c: Candidate = { taskId: "t-good", model: "fixture", code: GOOD };
  const v = await verify(c, prismaSpec, { tscEntry });
  assert.equal(v.passed, true, `expected clean compile, got: ${JSON.stringify(v.errors)}`);
});

test("verify fails a hallucinated Prisma candidate and captures the API error", async () => {
  const c: Candidate = { taskId: "t-bad", model: "fixture", code: HALLUCINATED };
  const v = await verify(c, prismaSpec, { tscEntry });
  assert.equal(v.passed, false);
  assert.ok(
    v.errors.some((e) => e.code === "TS2551" || e.message.includes("createOne")),
    `expected a createOne error, got: ${JSON.stringify(v.errors)}`,
  );
  assert.ok(v.errors.every((e) => e.libraryRelated));
});
