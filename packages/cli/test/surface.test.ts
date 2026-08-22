import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ambientSymbols, isDeprecated, isPublicName, resolveExports, subpathRoot, symbolsFromSource,
} from "../src/surface.ts";

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

test("exports has two shapes and both name the type entrypoint", () => {
  // The sugar form drops the "." and IS the condition map. chalk 6 uses it, and
  // reading only exports["."] reported a package with a perfectly good
  // index.d.ts as having no types at all.
  assert.deepEqual(subpathRoot({ types: "./source/index.d.ts", default: "./source/index.js" }), {
    types: "./source/index.d.ts",
    default: "./source/index.js",
  });
  assert.deepEqual(subpathRoot({ ".": { types: "./a.d.ts" }, "./sub": { types: "./b.d.ts" } }), {
    types: "./a.d.ts",
  });
  assert.equal(subpathRoot({ "./only-subpaths": { types: "./b.d.ts" } }), undefined);
  assert.equal(subpathRoot("./index.js"), undefined);
  assert.equal(subpathRoot(undefined), undefined);
});

test("ambientSymbols reads a declare module block", () => {
  // Every DefinitelyTyped package for a CommonJS library declares itself this
  // way, and an ES-export reader finds nothing in them.
  const src = `
declare module "winston" {
  export interface LoggerOptions { level?: string }
  export const transports: Transports;
  export function createLogger(o: LoggerOptions): Logger;
  class Logger {
    add(t: unknown): void;
  }
}
`;
  assert.deepEqual(
    [...ambientSymbols(src)].sort(),
    ["Logger", "LoggerOptions", "createLogger", "transports"],
  );
});

test("a block whose only member is a namespace is a container, not the surface", () => {
  // stripe is `declare module 'stripe' { namespace Stripe { ... } }`. Stopping
  // at the top level reports one symbol and a diff over nothing.
  const src = `
declare module "stripe" {
  namespace Stripe {
    interface Charge { id: string }
    const API_VERSION: string;
    namespace Issuing {
      interface Card { id: string }
    }
  }
}
`;
  const syms = ambientSymbols(src);
  assert.ok(syms.has("Charge"), [...syms].join(","));
  assert.ok(syms.has("API_VERSION"));
  assert.ok(syms.has("Issuing"), "the nested namespace is a member of the container");
  assert.ok(!syms.has("Card"), "but what is inside it is not");
});

test("nested members do not leak out of a normal ambient block", () => {
  const src = `
declare module "x" {
  export interface Outer {
    nested: { interface: string };
  }
  export function first(): void;
  export function second(): void;
  export const third: number;
  export const fourth: number;
}
`;
  assert.deepEqual([...ambientSymbols(src)].sort(), ["Outer", "first", "fourth", "second", "third"]);
});
