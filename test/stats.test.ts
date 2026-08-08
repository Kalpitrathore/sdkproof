import { test } from "node:test";
import assert from "node:assert/strict";
import { wilson, fmtInterval, rates, armDelta } from "../src/stats.ts";

const near = (a: number, b: number, tol = 5e-4) =>
  assert.ok(Math.abs(a - b) < tol, `expected ${b}, got ${a}`);

test("wilson matches known values for the published Stripe refusal rate", () => {
  // 62/150 refusals, measured 2026-08-04. Point estimate 41.3%.
  const ci = wilson(62, 150);
  near(ci.low, 0.3376);
  near(ci.high, 0.4933);
});

/**
 * The reason this module exists. A 10/10 row reads as certainty and a 0/10 row
 * reads as impossibility; neither is what n=10 supports. Wilson says the first
 * is only ">=72%" and the second is "up to ~28%" — close to the rule of three
 * (3/n = 30%), which is the sanity check on the arithmetic.
 */
test("wilson keeps 10/10 and 0/10 honest at n=10", () => {
  const all = wilson(10, 10);
  near(all.low, 0.7225);
  assert.equal(all.high, 1);

  const none = wilson(0, 10);
  assert.equal(none.low, 0);
  near(none.high, 0.2775);
  assert.ok(none.high < 0.3, "should sit just inside the rule-of-three bound");
});

test("wilson is symmetric under k -> n-k", () => {
  const a = wilson(3, 10);
  const b = wilson(7, 10);
  near(a.low, 1 - b.high);
  near(a.high, 1 - b.low);
});

// Same rule as exp-refusals.ts: anything that computes a rate must refuse to
// show you one when its inputs broke, rather than return a confident zero.
test("wilson refuses a broken denominator instead of returning 0", () => {
  assert.throws(() => wilson(0, 0), /denominator/i);
  assert.throws(() => wilson(5, 3), /0 <= k <= n/);
  assert.throws(() => wilson(-1, 3), /0 <= k <= n/);
});

test("fmtInterval renders one-decimal percentages", () => {
  assert.equal(fmtInterval(wilson(62, 150)), "33.8–49.3%");
  assert.equal(fmtInterval(wilson(10, 10)), "72.2–100%");
});

/**
 * The comment this was built for (dev.to, 2026-08-06): a 100% conditional score
 * and a 67% unconditional one are both true of the same Stripe run, and
 * publishing only the first hides the failure mode.
 */
test("rates splits the Stripe run into its two true numbers", () => {
  const r = rates({ passed: 10, scored: 10, refused: 5 });
  assert.equal(r.conditional.passed, 10);
  assert.equal(r.conditional.n, 10);
  assert.equal(r.conditional.pct, 100);
  assert.equal(r.unconditional.n, 15);
  assert.equal(r.unconditional.pct, 67);
  assert.equal(r.split, true, "the two rates differ, so both must be shown");
});

test("rates collapses to one number when nothing was refused", () => {
  const r = rates({ passed: 13, scored: 15, refused: 0 });
  assert.equal(r.conditional.pct, 87);
  assert.equal(r.unconditional.pct, 87);
  assert.equal(r.unconditional.n, 15);
  assert.equal(r.split, false);
});

/**
 * The question this was added for (2026-08-08): a context arm and its baseline
 * are two rates over two independent sets of generations, and the whole point
 * of an arm is the difference between them. Two overlapping Wilson intervals
 * are not a test of that difference, and eyeballing "42/45 vs 41/45" as an
 * improvement is exactly the mistake this module exists to prevent — one
 * generation out of forty-five.
 */
test("armDelta refuses to call a one-generation difference an effect", () => {
  // React Router, skill-only 42/45 against a 41/45 baseline: +2.2 points.
  const d = armDelta(42, 45, 41, 45);
  near(d.diff, 0.0222);
  assert.ok(d.low < 0 && d.high > 0, "interval must straddle zero");
  assert.equal(d.significant, false);
});

test("armDelta reports the sign only when the interval clears zero", () => {
  // Prisma's full-setup arm, 42/45 vs 39/45 — the biggest whole-scorecard
  // delta on the board, and still not separable at n=45.
  const small = armDelta(42, 45, 39, 45);
  near(small.diff, 0.0667);
  assert.equal(small.significant, false);

  // The same docs measured on the one task that actually fails: 10/10 vs 0/10.
  // That is what an effect looks like.
  const real = armDelta(10, 10, 0, 10);
  near(real.diff, 1);
  assert.ok(real.low > 0, "a 0/10 -> 10/10 move must clear zero");
  assert.equal(real.significant, true);
});

test("armDelta rejects an empty denominator rather than returning zero", () => {
  assert.throws(() => armDelta(0, 0, 1, 10), /empty denominator/);
});
