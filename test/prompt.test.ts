import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCode, buildUserPrompt } from "../src/prompt.ts";

test("extractCode pulls the fenced ts block", () => {
  const out = extractCode("Here you go:\n```ts\nconst x = 1;\n```\nDone.");
  assert.equal(out, "const x = 1;");
});

test("extractCode handles a plain ``` fence", () => {
  assert.equal(extractCode("```\nconst y = 2;\n```"), "const y = 2;");
});

test("extractCode falls back to raw text when no fence", () => {
  assert.equal(extractCode("  const z = 3;  "), "const z = 3;");
});

/**
 * The bare prompt is load-bearing: six published scores were produced by it.
 * buildUserPrompt gained an optional context argument for --with-context runs,
 * and this pins the no-context output so that addition can never quietly move
 * a number that is already on the web.
 */
test("buildUserPrompt without context is unchanged, and context is additive", () => {
  const spec = {
    id: "x", packageName: "x", displayName: "X",
    fixtureDir: "/tmp", docsHint: "the hint",
  };
  const task = {
    id: "t", area: "a", difficulty: "easy" as const,
    prompt: "do the thing", skeleton: "// skeleton\n",
  };
  const bare = buildUserPrompt(task, spec);
  assert.equal(
    bare,
    'Library: X, imported from "x".\nthe hint\n\nTask: do the thing\n\nComplete this module:\n```ts\n// skeleton\n\n```',
  );
  assert.equal(buildUserPrompt(task, spec, undefined), bare, "undefined context must be a no-op");
  assert.equal(buildUserPrompt(task, spec, ""), bare, "empty context must be a no-op");

  const withCtx = buildUserPrompt(task, spec, "SKILL FILE BODY");
  assert.ok(withCtx.endsWith(bare), "the bare prompt must survive verbatim at the end");
  assert.ok(withCtx.includes("SKILL FILE BODY"));
});
