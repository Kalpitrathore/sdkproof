import { test } from "node:test";
import assert from "node:assert/strict";
import { classify } from "../src/classify.ts";
import { score } from "../src/score.ts";
import type { Verdict } from "../src/types.ts";

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
