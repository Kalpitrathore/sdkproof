import { test } from "node:test";
import assert from "node:assert/strict";
import { recommend } from "../src/recommend.ts";
import { prismaSpec } from "../src/libraries/prisma.ts";
import type { Result } from "../src/types.ts";

/**
 * The rule that keeps this feature honest: an item without a measurement
 * behind it is never emitted. Generic documentation advice would undo
 * everything the compiler-decides framing earned, so it is a test, not a
 * convention.
 */
const base: Result = {
  library: "prisma", libraryVersion: "7.8.0", generatedAt: "2026-08-06T00:00:00Z",
  overallScore: 100, perModel: [{ model: "m", passed: 1, total: 1, score: 100 }],
  failurePatterns: [], verdicts: [{ taskId: "t", model: "m", passed: true, errors: [] }],
  refusals: [],
};

test("a clean run with no context arms produces no recommendations", async () => {
  const recs = await recommend(base, prismaSpec);
  assert.deepEqual(recs, [], "nothing measured means nothing to recommend");
});

test("every emitted recommendation carries evidence", async () => {
  const result: Result = {
    ...base,
    overallScore: 0,
    verdicts: [{
      taskId: "construct-with-url", model: "m", passed: false,
      errors: [{ code: "TS2353", message: "Object literal may only specify known properties, and 'datasourceUrl' does not exist in type 'X'.", line: 1, column: 1, libraryRelated: true }],
    }],
    contextArms: [{
      name: "full-setup", label: "l", passed: 1, total: 1, score: 100,
      baselineScore: 0, delta: 100, comparedOn: 1, trials: 3,
      fixed: ["construct-with-url"], failed: [],
    }],
  };
  const recs = await recommend(result, prismaSpec);
  assert.ok(recs.length > 0, "a fixed-by-an-arm failure should yield a routing recommendation");
  for (const r of recs) {
    assert.ok(r.evidence.length > 0, `"${r.title}" shipped without evidence`);
    assert.ok(r.title.length > 0 && r.detail.length > 0);
  }
});

test("the survey alone never produces advice without a measured library match", async () => {
  const recs = await recommend(base, prismaSpec, { rows: [{ name: "Some Other Library", files: [] }] });
  assert.deepEqual(recs, []);
});

test("a library that publishes nothing still gets the recommendation", async () => {
  // The first version only fired when a file existed, so the strongest version
  // of this item — "you ship nothing at all" — was silently dropped for the one
  // library it applied to.
  const recs = await recommend(base, prismaSpec, {
    rows: [{ name: "Prisma", files: [
      { url: "example.com/llms.txt", chars: 0 },
      { url: "example.com/llms-full.txt", chars: 0 },
    ] }],
  });
  assert.equal(recs.length, 1);
  assert.match(recs[0].title, /publish nothing/i);
  assert.ok(recs[0].evidence.length === 2);
});
