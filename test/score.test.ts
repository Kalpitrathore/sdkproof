import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/classify.ts";
import { score } from "../src/score.ts";
import type { Verdict } from "../src/types.ts";
import { renderScorecard } from "../src/report.ts";

const verdicts: Verdict[] = [
  { taskId: "t1", model: "claude", passed: true, errors: [] },
  {
    taskId: "t2",
    model: "claude",
    passed: false,
    errors: [{ code: "TS2551", message: "no createOne", line: 4, column: 22, libraryRelated: true }],
  },
  {
    taskId: "t1",
    model: "gpt",
    passed: false,
    errors: [{ code: "TS2554", message: "wrong args", line: 3, column: 1, libraryRelated: true }],
  },
  {
    taskId: "t2",
    model: "gpt",
    passed: false,
    errors: [{ code: "TS2551", message: "no upsertOne", line: 5, column: 2, libraryRelated: true }],
  },
];

test("classify buckets and ranks failure patterns by frequency", () => {
  const patterns = classify(verdicts);
  assert.equal(patterns[0].category, "hallucinated-member");
  assert.equal(patterns[0].count, 2);
  assert.ok(patterns.some((p) => p.category === "wrong-arguments"));
});

test("score computes per-model and overall scores", () => {
  const r = score("prisma", "7.8.0", "2026-07-16T00:00:00Z", verdicts);
  const claude = r.perModel.find((m) => m.model === "claude")!;
  const gpt = r.perModel.find((m) => m.model === "gpt")!;
  assert.equal(claude.score, 50); // 1 of 2
  assert.equal(gpt.score, 0); // 0 of 2
  assert.equal(r.overallScore, 25); // 1 of 4
});

test("refusals are excluded from the score and stated on the scorecard", () => {
  const verdicts: Verdict[] = [
    { taskId: "a", model: "m", passed: true, errors: [] },
    { taskId: "b", model: "m", passed: true, errors: [] },
  ];
  const refusals = [{ taskId: "c", model: "m", attempts: 4 }];
  const r = score("stripe", "22.4.0", "2026-08-04T00:00:00Z", verdicts, refusals);

  // The score covers what was measured, not what was written.
  assert.equal(r.overallScore, 100);
  assert.equal(r.perModel[0].total, 2);
  assert.equal(r.refusals.length, 1);

  const md = renderScorecard(r, {
    id: "stripe",
    packageName: "stripe",
    displayName: "Stripe",
    fixtureDir: "/tmp",
    docsHint: "",
  });
  // A reader must see the shortfall in the same breath as the number.
  assert.match(md, /1 task refused/);
  assert.match(md, /`c`/);
  assert.match(md, /covering 2 of 3 written tasks/);
});
