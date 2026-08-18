import { test } from "node:test";
import assert from "node:assert/strict";
import { verify, parseDiagnostics, augmentsLibrary, API_SHAPE_CODES } from "../src/verify.ts";
import { categorize, classify } from "../src/classify.ts";
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


/**
 * Module augmentation re-creates a removed API, so a candidate written entirely
 * against the OLD surface compiles clean and scores as a PASS.
 *
 * Found 2026-08-17 probing react-router v8, which deleted `AppLoadContext`.
 * Five of nine candidates reached for it; only three failed. The two that
 * passed had also written `declare module "react-router" { interface
 * AppLoadContext {...} }` — the canonical v7 idiom, which declares the deleted
 * interface straight back into the module, so the import beside it resolves.
 * The one that imported it WITHOUT augmenting failed with TS2305, correctly.
 *
 * Same failure class as an empty candidate passing (2026-08-04) and TS2305
 * missing from API_SHAPE_CODES (2026-08-13): a defect that makes the number
 * look cleaner than the truth. SDKP002 sits outside API_SHAPE_CODES so it can
 * never be counted as library drift either.
 */
test("verify rejects a candidate that augments the library's own module", async () => {
  // This compiles clean against the real package — that is the whole problem.
  const code = [
    'import type { PrismaClient } from "@prisma/client";',
    'declare module "@prisma/client" {',
    "  interface RemovedThing { id: string }",
    "}",
    "export const solve = (c: PrismaClient) => c;",
  ].join("\n");
  const v = await verify({ taskId: "t", model: "m", code }, prismaSpec, { tscEntry });
  assert.equal(v.passed, false, "a candidate that redefines the library must never pass");
  assert.equal(v.errors[0].code, "SDKP002");
  assert.equal(
    v.errors[0].libraryRelated,
    false,
    "a harness failure must never be counted as library drift",
  );
});

test("augmentsLibrary matches the package and its subpaths, and nothing else", () => {
  // The exact react-router v8 shape that started this.
  assert.ok(
    augmentsLibrary('declare module "react-router" { interface AppLoadContext {} }', "react-router"),
    "must catch augmentation of the package itself",
  );
  // Scoped names contain regex metacharacters; they must be escaped, not interpreted.
  assert.ok(
    augmentsLibrary('declare module "@apollo/client/react" {}', "@apollo/client"),
    "must catch augmentation of a subpath entrypoint",
  );
  assert.ok(augmentsLibrary("declare module '@apollo/client' {}", "@apollo/client"), "single quotes count");

  // The regression guard: a DIFFERENT module being augmented is legitimate and
  // must not fire. Deliberately uses a name that contains the package name as a
  // substring, so a sloppy `includes()` implementation would fail this.
  assert.equal(
    augmentsLibrary('declare module "react-router-extra" {}', "react-router"),
    null,
    "a different module whose name merely starts with the package must not fire",
  );
  assert.equal(
    augmentsLibrary('declare module "express" { interface Request {} }', "react-router"),
    null,
    "augmenting an unrelated module is legitimate",
  );
  assert.equal(augmentsLibrary("export const solve = () => 1;", "react-router"), null);
});

/**
 * The import-drift codes must be CATEGORISED, not just counted.
 *
 * TS2305 and TS1192 were added to API_SHAPE_CODES on 2026-08-13 so they would
 * count as library drift, but they were never added to CODE_CATEGORY — so they
 * fell through to "other", which is what the scorecard prints as its top
 * failure pattern. Apollo Client 4, the flagship finding, published
 * "other: 4" for four TS2305s. Found 2026-08-18 re-scoring the AI SDK.
 *
 * TS2724 belongs with them: it is TS2305 with a did-you-mean attached, and
 * splitting one error family across two categories is exactly the
 * inconsistency the 08-13 fix existed to remove.
 */
test("every import-drift code lands in deprecated-or-removed, not other", () => {
  for (const code of ["TS2305", "TS2724", "TS1192"]) {
    assert.equal(
      categorize(code),
      "deprecated-or-removed",
      `${code} must not fall through to "other" — it is the finding`,
    );
  }
});

test("no API_SHAPE_CODE falls through to other", () => {
  // Any code trusted enough to count as library drift must also be nameable on
  // the scorecard. These two sets drifting apart is what caused the bug above.
  for (const code of API_SHAPE_CODES) {
    assert.notEqual(categorize(code), "other", `${code} counts as drift but has no category`);
  }
});

/**
 * A single failed type import produces one TS2305 plus one TS7031 for every
 * parameter that just lost its annotation, so the downstream noise outnumbers
 * the cause. Ranking purely by count printed "other - 11x implicitly has an
 * 'any' type" as the AI SDK's headline failure, with the four removed types
 * underneath it. The residual bucket must never lead.
 */
test("the residual 'other' bucket never outranks a real category", () => {
  const verdicts = [
    { taskId: "t", model: "m", passed: false, errors: [
      { code: "TS2305", message: "no exported member", line: 1, column: 1, libraryRelated: true },
      ...Array.from({ length: 9 }, () => (
        { code: "TS7031", message: "implicitly has an 'any' type", line: 1, column: 1, libraryRelated: false }
      )),
    ] },
  ] as never;
  const patterns = classify(verdicts);
  assert.equal(patterns[0].category, "deprecated-or-removed", "the cause must lead, not the consequence");
  assert.equal(patterns[0].count, 1);
  assert.equal(patterns[1].category, "other");
  assert.equal(patterns[1].count, 9, "the noise is still reported, just not first");
});
