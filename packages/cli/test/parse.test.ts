import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSpec } from "../src/run.ts";
import { parseModelRef } from "../src/models.ts";
import { typesPackageFor } from "../src/workspace.ts";

test("parseSpec keeps a scope's leading @ out of the version", () => {
  assert.deepEqual(parseSpec("zod"), { name: "zod" });
  assert.deepEqual(parseSpec("zod@4"), { name: "zod", version: "4" });
  assert.deepEqual(parseSpec("@tanstack/react-table"), { name: "@tanstack/react-table" });
  assert.deepEqual(parseSpec("@tanstack/react-table@9.1.2"), {
    name: "@tanstack/react-table",
    version: "9.1.2",
  });
  assert.deepEqual(parseSpec("@apollo/client@next"), { name: "@apollo/client", version: "next" });
});

test("parseModelRef infers the provider, and takes an explicit one", () => {
  assert.deepEqual(parseModelRef("claude-opus-5"), { provider: "anthropic", model: "claude-opus-5" });
  assert.deepEqual(parseModelRef("gpt-5"), { provider: "openai", model: "gpt-5" });
  assert.deepEqual(parseModelRef("openai:some-new-id"), { provider: "openai", model: "some-new-id" });
  assert.deepEqual(parseModelRef("anthropic:claude-x"), { provider: "anthropic", model: "claude-x" });
});

test("parseModelRef refuses to guess when it cannot tell", () => {
  assert.throws(() => parseModelRef("llama-3"), /anthropic:<id> or openai:<id>/);
});

test("typesPackageFor follows the DefinitelyTyped naming convention", () => {
  assert.equal(typesPackageFor("react"), "@types/react");
  assert.equal(typesPackageFor("@tanstack/react-table"), "@types/tanstack__react-table");
});
