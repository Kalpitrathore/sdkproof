import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { tscEntry } from "../src/env.ts";
import { verify } from "../src/verify.ts";
import { prismaSpec } from "../src/libraries/prisma.ts";
import { aisdkSpec } from "../src/libraries/aisdk.ts";
import { zodSpec } from "../src/libraries/zod.ts";
import { tanstackQuerySpec } from "../src/libraries/tanstack-query.ts";
import { nextjsSpec } from "../src/libraries/nextjs.ts";
import { reactRouterSpec } from "../src/libraries/react-router.ts";
import { stripeSpec } from "../src/libraries/stripe.ts";
import type { LibrarySpec } from "../src/types.ts";

/**
 * Every fixture must be able to express a PASSING answer.
 *
 * Why this exists: on 2026-07-31 the Prisma fixture had no driver-adapter
 * package installed, so the *correct* v7 construction —
 * `new PrismaClient({ adapter })` — failed with TS2307 cannot-find-module.
 * TS2307 is in API_SHAPE_CODES, so a missing devDependency was being recorded
 * and published as model drift. Nothing in the suite could have caught it.
 *
 * A scorecard whose fixture cannot express a pass is measuring the harness, not
 * the model. So each fixture ships a hand-authored `known-good.ts` that uses the
 * library's CURRENT API — including the drift-prone surface the tasks probe —
 * and it must compile clean through the exact path a model candidate takes.
 *
 * When a library ships a breaking major, this test is the first thing that
 * should fail. Update `known-good.ts` to the new API before trusting any score.
 */
const SPECS: LibrarySpec[] = [
  prismaSpec,
  aisdkSpec,
  zodSpec,
  tanstackQuerySpec,
  nextjsSpec,
  reactRouterSpec,
  stripeSpec,
];

for (const spec of SPECS) {
  test(`${spec.id} fixture can express a passing answer`, async () => {
    const file = path.join(spec.fixtureDir, "known-good.ts");
    const code = await readFile(file, "utf8");

    const verdict = await verify(
      { taskId: "known-good", model: "hand-authored", code },
      spec,
      { tscEntry },
    );

    assert.equal(
      verdict.passed,
      true,
      `${spec.id}/known-good.ts must compile clean against the installed ` +
        `${spec.packageName}, but tsc reported:\n` +
        verdict.errors.map((e) => `  ${e.code}: ${e.message}`).join("\n") +
        `\n\nThe fixture — not the model — is broken. Any score produced from ` +
        `it is suspect until this passes.`,
    );
  });
}
