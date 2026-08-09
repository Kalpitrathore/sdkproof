/**
 * The published page must agree with the run data it claims to report.
 *
 * Three wrong numbers surfaced on this site on 2026-08-08 and all three failed
 * in the same place — not in the measurement, but in a human copying a result
 * into HTML. A `9/10` that the result file records as 10/10, an `8/10` whose
 * arm had been dropped from the spec so nothing verified it, and an
 * `87 -> 93` published as an improvement when the interval spans zero.
 *
 * So this asserts the direction that actually breaks: every arm rate printed on
 * skills-delta.html is checked against data/*.result.json, and every arm
 * described as an effect is checked against armDelta().
 *
 * Raw run data is gitignored (see .gitignore), so the test skips rather than
 * fails when data/ has not been populated — a fresh clone has the page but not
 * the runs behind it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { projectRoot } from "../src/env.ts";
import { armDelta } from "../src/stats.ts";

const dataDir = path.join(projectRoot, "data");
const pagePath = path.join(projectRoot, "docs", "skills-delta.html");

interface Arm {
  name: string;
  passed: number;
  total: number;
  baselineScore: number;
  comparedOn?: number;
}

function loadArms(): Map<string, Arm> {
  const out = new Map<string, Arm>();
  if (!existsSync(dataDir)) return out;
  for (const f of readdirSync(dataDir).filter((x) => x.endsWith(".result.json"))) {
    const r = JSON.parse(readFileSync(path.join(dataDir, f), "utf8"));
    for (const a of r.contextArms ?? []) out.set(`${f.replace(".result.json", "")}:${a.name}`, a);
  }
  return out;
}

/** The baseline is stored rounded to a percentage; recover its count. */
const baseCount = (a: Arm) => Math.round((a.baselineScore / 100) * a.total);

test("every arm rate on skills-delta.html appears in the run data", (t) => {
  const arms = loadArms();
  if (!arms.size || !existsSync(pagePath)) {
    t.skip("no run data on disk — raw results are gitignored");
    return;
  }
  const page = readFileSync(pagePath, "utf8");

  // Pull every "N / M" cell the page prints, then require each to be a real
  // arm rate. This catches a typo'd numerator, which is exactly the 9/10 bug.
  const printed = [...page.matchAll(/>(\d+)\s*\/\s*(\d+)</g)].map((m) => `${m[1]}/${m[2]}`);
  assert.ok(printed.length > 10, `expected the arm tables to be present, found ${printed.length} cells`);

  const known = new Set<string>();
  for (const a of arms.values()) {
    known.add(`${a.passed}/${a.total}`);
    known.add(`${baseCount(a)}/${a.total}`);
    // The ceiling rows state a hypothetical perfect arm against its baseline.
    known.add(`${a.total}/${a.total}`);
  }
  // 0/10 baselines are stated on the failing-task table.
  known.add("0/10");

  for (const cell of printed) {
    assert.ok(known.has(cell), `page prints ${cell}, which is not any arm rate in data/`);
  }
});

test("no arm is described as an effect unless its interval clears zero", (t) => {
  const arms = loadArms();
  if (!arms.size) {
    t.skip("no run data on disk — raw results are gitignored");
    return;
  }

  // The two counts the page leads with. If a rerun moves either, the headline
  // is wrong and this fails rather than letting the page drift.
  const all = [...arms.values()];
  const scorecard = all.filter((a) => (a.comparedOn ?? 1) > 1);
  const failing = all.filter((a) => (a.comparedOn ?? 1) === 1);
  const sig = (xs: Arm[]) =>
    xs.filter((a) => armDelta(a.passed, a.total, baseCount(a), a.total).significant).length;

  assert.equal(scorecard.length, 6, "expected six scorecard-scale arms");
  assert.equal(sig(scorecard), 0, "a scorecard arm now clears zero — the page's headline is stale");
  assert.equal(failing.length, 11, "expected eleven failing-task arms");
  assert.equal(sig(failing), 8, "the failing-task count moved — update the page");
});

test("the ceiling argument still holds: a perfect React Router fix is undetectable", () => {
  // The load-bearing claim of the page. If this ever becomes significant the
  // argument is wrong and the page must change.
  const perfect = armDelta(45, 45, 41, 45);
  assert.equal(perfect.significant, false);
  const prisma = armDelta(45, 45, 39, 45);
  assert.equal(prisma.significant, true, "Prisma's ceiling is stated as barely detectable");
});
