import assert from "node:assert/strict";
import { test } from "node:test";
import { score } from "../src/core/score.ts";
import type { Verdict } from "../src/core/types.ts";
import { renderMarkdown, renderTerminal, type RunContext } from "../src/report.ts";

const ctx: RunContext = {
  packageName: "demo",
  version: "2.0.0",
  extraInstalls: [],
  taskSet: {
    packageName: "demo",
    version: "2.0.0",
    docsHint: "",
    source: "synthesized",
    rejected: [],
    tasks: [
      { id: "ok-task", area: "core", difficulty: "easy", prompt: "p", skeleton: "" },
      { id: "broken-task", area: "core", difficulty: "hard", prompt: "p", skeleton: "" },
    ],
  },
};

const verdicts: Verdict[] = [
  { taskId: "ok-task", model: "m", passed: true, errors: [] },
  {
    taskId: "broken-task",
    model: "m",
    passed: false,
    errors: [
      { code: "TS7031", message: "implicitly has an 'any' type", line: 3, column: 1, libraryRelated: false },
      { code: "TS2305", message: "has no exported member 'gone'", line: 1, column: 1, libraryRelated: true },
    ],
  },
];

test("the library-related error leads, not the downstream noise it caused", () => {
  // One failed type import produces a TS2305 plus an implicit-any per parameter
  // that lost its annotation. Showing the first diagnostic shows the symptom.
  const out = renderTerminal(score("demo", "2.0.0", "now", verdicts, []), ctx);
  const broken = out.slice(out.indexOf("broken-task"));
  assert.ok(broken.includes("TS2305"), out);
  assert.ok(broken.indexOf("TS2305") < broken.indexOf("+1 more"), out);
});

test("a run that lost tasks says so in both renderings, and says not to publish it", () => {
  const r = score("demo", "2.0.0", "now", verdicts, [], [], [
    { taskId: "never-ran", model: "m", reason: "529 overloaded_error" },
  ]);
  const terminal = renderTerminal(r, ctx);
  assert.match(terminal, /INCOMPLETE RUN/);
  assert.match(terminal, /not refusals/i);
  assert.match(terminal, /do not publish/i);
  const md = renderMarkdown(r, ctx);
  assert.match(md, /Incomplete run/i);
  assert.match(md, /do not publish/i);
});

test("a refusal is reported as unmeasured rather than folded into the score", () => {
  const r = score("demo", "2.0.0", "now", verdicts, [{ taskId: "refused", model: "m", attempts: 4 }]);
  const terminal = renderTerminal(r, ctx);
  assert.match(terminal, /1 refused — unmeasured, not drift/);
  // The score itself is over what was actually written: 1 of 2 compiled.
  assert.equal(r.overallScore, 50);
});

test("a clean run carries no warning and says nothing drifted", () => {
  const r = score("demo", "2.0.0", "now", [verdicts[0]], []);
  const terminal = renderTerminal(r, ctx);
  assert.ok(!terminal.includes("INCOMPLETE"));
  assert.match(terminal, /Every candidate compiled/);
});
