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

/**
 * The mirror of the known-good guard. That one proves a fixture can express a
 * PASS; these prove a non-answer can never BE one.
 *
 * Why: on 2026-08-04 the first Stripe run scored 100/100 with four of fifteen
 * candidates empty. An empty file compiles clean, so verify() passed it — the
 * harness reported "the model produced nothing" as "the model got it right".
 * Refusals were the cause and they are stochastic, so this can recur on any
 * library at any time. SDKP001 is deliberately outside API_SHAPE_CODES so a
 * harness failure can never be classified as library drift.
 */
for (const [name, code] of [
  ["empty", ""],
  ["whitespace only", "   \n\n  "],
  ["imports and comments only", 'import Stripe from "stripe";\n// TODO\n'],
  ["no export", 'import Stripe from "stripe";\nasync function solve() { return 1; }\n'],
] as const) {
  test(`verify fails a ${name} candidate without running tsc`, async () => {
    const candidate: Candidate = { taskId: "t", model: "m", code };
    const v = await verify(candidate, prismaSpec, { tscEntry });
    assert.equal(v.passed, false, "a non-answer must never pass");
    assert.equal(v.errors[0].code, "SDKP001");
    assert.equal(
      v.errors[0].libraryRelated,
      false,
      "a harness failure must never be counted as library drift",
    );
  });
}

/**
 * TS2305 and TS1192 are the two canonical shapes of "you imported the old API":
 * the member moved out of this entrypoint, or the default export is gone. Both
 * are exactly what this project measures, and both were missing from
 * API_SHAPE_CODES — they were classified as library drift only when the error
 * text happened to contain the package name, which is an accident of how tsc
 * renders module paths, not a rule.
 *
 * Found 2026-08-13 measuring zustand 5, whose removed default export reports
 * TS1192 against a resolved *filesystem path*. It matched "zustand" only
 * because the path contains the package directory name.
 *
 * TS2724 — the same error as TS2305 with a did-you-mean suggestion attached —
 * was already in the set, so excluding TS2305 was an inconsistency rather than
 * a decision.
 */
test("the two import-drift codes are classified as API shape", () => {
  const drift = parseDiagnostics(
    'candidate.ts(1,10): error TS2305: Module \'"somelib"\' has no exported member \'useQuery\'.',
    { packageName: "unrelated-package" } as never,
  );
  assert.equal(drift[0].code, "TS2305");
  assert.equal(drift[0].libraryRelated, true, "TS2305 must count without relying on the message text");

  const noDefault = parseDiagnostics(
    "candidate.ts(1,8): error TS1192: Module '/tmp/x/esm/index' has no default export.",
    { packageName: "unrelated-package" } as never,
  );
  assert.equal(noDefault[0].code, "TS1192");
  assert.equal(noDefault[0].libraryRelated, true, "TS1192 must count without relying on the path");
});
