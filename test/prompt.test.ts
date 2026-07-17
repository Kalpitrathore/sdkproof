import { test } from "node:test";
import assert from "node:assert/strict";
import { extractCode } from "../src/prompt.ts";

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
