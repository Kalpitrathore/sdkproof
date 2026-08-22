import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeprecated, isPublicName, resolveExports, symbolsFromSource } from "../src/surface.ts";

test("symbolsFromSource reads every shape a .d.ts exports", () => {
  const syms = symbolsFromSource(`
export { alpha, beta as gamma } from "./x";
export type { Delta } from "./y";
export declare function epsilon(): void;
export declare abstract class Zeta {}
export interface Eta {}
export const theta: number;
declare function notExported(): void;
`);
  assert.deepEqual(
    [...syms].sort(),
    ["Delta", "Eta", "Zeta", "alpha", "epsilon", "gamma", "theta"],
  );
  assert.ok(!syms.has("notExported"));
  assert.ok(!syms.has("beta"), "the local name of a renamed re-export is not the exported name");
});

test("resolveExports follows a barrel entrypoint through export *", () => {
  // @apollo/client v3's entry is exactly this: one `export *`. Reading only the
  // entry file yields ZERO symbols, and the diff against v4 then reports the
  // entire public surface as removed.
  const files = new Map([
    ["index.d.ts", 'export * from "./core/index.js";\nexport { standalone } from "./extra.js";'],
    ["core/index.d.ts", 'export declare function useQuery(): void;\nexport * from "./inner.js";'],
    ["core/inner.d.ts", "export declare const deep: number;"],
    ["extra.d.ts", "export declare const standalone: 1;"],
  ]);
  const { symbols, unresolved } = resolveExports(files, "index.d.ts");
  assert.deepEqual([...symbols].sort(), ["deep", "standalone", "useQuery"]);
  assert.deepEqual(unresolved, []);
});

test("resolveExports reports an export * it cannot follow instead of under-counting", () => {
  const files = new Map([["index.d.ts", 'export * from "some-other-package";']]);
  const { symbols, unresolved } = resolveExports(files, "index.d.ts");
  assert.equal(symbols.size, 0);
  assert.deepEqual(unresolved, ["some-other-package"]);
});

test("a re-export cycle terminates", () => {
  const files = new Map([
    ["a.d.ts", 'export * from "./b.js";\nexport declare const fromA: 1;'],
    ["b.d.ts", 'export * from "./a.js";\nexport declare const fromB: 2;'],
  ]);
  const { symbols } = resolveExports(files, "a.d.ts");
  assert.deepEqual([...symbols].sort(), ["fromA", "fromB"]);
});

test("isDeprecated only counts the jsdoc attached to that declaration", () => {
  const src = `
/** @deprecated use bar */
export declare function foo(): void;

/** Perfectly current. */
export declare function bar(): void;
`;
  assert.ok(isDeprecated([src], "foo"));
  assert.ok(!isDeprecated([src], "bar"));
});

test("names nobody writes on purpose are not findings", () => {
  assert.ok(isPublicName("useQuery"));
  assert.ok(!isPublicName("UNSAFE_componentWillMount"));
  assert.ok(!isPublicName("unstable_batchedUpdates"));
  assert.ok(!isPublicName("__internal"));
  assert.ok(!isPublicName("_getVisibleLeafColumns"), "a single leading underscore means internal too");
});
