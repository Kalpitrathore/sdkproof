import assert from "node:assert/strict";
import { test } from "node:test";
import { augmentsLibrary, emptyCandidate } from "../src/core/verify.ts";

test("a candidate written without semicolons is code, not an empty file", () => {
  // `[^;]*` in the import strip spans newlines, so a semicolon-free candidate
  // had its whole body swallowed and was recorded as "no implementation". It
  // cost zustand a task on 2026-08-04 — a 78-line answer scored as empty — and
  // every candidate of the first @sanity/client run through this CLI.
  const code = `// Count the posts.
import { createClient } from '@sanity/client'

export async function getPostCount(projectId: string): Promise<number> {
  const client = createClient({ projectId, dataset: 'production', apiVersion: '2023-01-01' })
  return client.fetch<number>('count(*[_type == "post"])')
}
`;
  assert.equal(emptyCandidate(code), null);
});

test("the guards that must still fire, do", () => {
  assert.match(emptyCandidate("")!, /empty candidate/);
  assert.match(emptyCandidate("   \n\t ")!, /empty candidate/);
  assert.match(emptyCandidate('import { z } from "zod";\n// nothing here\n')!, /only imports and comments/);
  assert.match(emptyCandidate("import { z } from 'zod'\n// nothing here\n")!, /only imports and comments/);
  assert.match(emptyCandidate("const x = 1;\n")!, /does not implement the requested export/);
});

test("a multi-line import is left in place rather than swallowed", () => {
  // Not stripped is the safe direction: the candidate reaches tsc, and the
  // compiler decides instead of this heuristic.
  const code = "import {\n  createClient,\n  type ClientConfig,\n} from '@sanity/client'\n\nexport const a = 1\n";
  assert.equal(emptyCandidate(code), null);
});

test("augmentsLibrary still catches a redefinition of the package under test", () => {
  assert.match(
    augmentsLibrary('declare module "react-router" { interface AppLoadContext {} }', "react-router")!,
    /module augmentation/,
  );
  assert.equal(augmentsLibrary('declare module "other-lib" {}', "react-router"), null);
});
