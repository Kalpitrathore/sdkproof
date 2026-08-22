import assert from "node:assert/strict";
import { test } from "node:test";
import { diffSurfaces, driftVerdict, headlineRemovals, type DriftReport } from "../src/drift.ts";
import type { Surface } from "../src/surface.ts";

function surface(over: Partial<Surface>): Surface {
  return {
    entryOnly: new Set(),
    widened: new Set(),
    needsWiden: false,
    sources: [],
    entry: "index.d.ts",
    unresolved: [],
    readme: "",
    ...over,
  };
}

test("the widen decision is made once for the pair, never per version", () => {
  // Deciding it per version is what made Apollo read as a 674 -> 133 collapse:
  // v3's entry triggered the widen and v4's did not, so a wide surface was
  // diffed against a narrow one and every internal counted as a removal.
  const a = surface({
    entryOnly: new Set(["publicA"]),
    widened: new Set(["publicA", "internalA"]),
    needsWiden: true,
  });
  const b = surface({
    entryOnly: new Set(["publicA"]),
    widened: new Set(["publicA", "internalA"]),
    needsWiden: false,
  });
  const d = diffSurfaces(a, b, "");
  assert.equal(d.mode, "all-dts");
  assert.deepEqual(d.removed, [], "like-for-like: nothing actually went");
});

test("a removal that was deprecated first is not counted as drift", () => {
  const a = surface({
    entryOnly: new Set(["kept", "retired", "vanished"]),
    widened: new Set(["kept", "retired", "vanished"]),
    sources: ["/** @deprecated use kept */\nexport declare function retired(): void;"],
  });
  const b = surface({ entryOnly: new Set(["kept"]), widened: new Set(["kept"]) });
  const d = diffSurfaces(a, b, "");
  assert.deepEqual(d.removed, ["retired", "vanished"]);
  assert.deepEqual(d.withoutRunway, ["vanished"]);
  assert.deepEqual(d.removedFromEntry, ["vanished"]);
});

test("removals the old README documented are the ones a model will still write", () => {
  const a = surface({
    entryOnly: new Set(["documented", "InternalHelperType"]),
    widened: new Set(["documented", "InternalHelperType"]),
  });
  const b = surface({ entryOnly: new Set(), widened: new Set() });
  const d = diffSurfaces(a, b, "Call `documented()` to get started.");
  assert.deepEqual(d.documentedRemovals, ["documented"]);
  assert.deepEqual(d.removedFromEntry, ["InternalHelperType", "documented"]);
});

test("a README word-boundary match does not fire on a longer name", () => {
  const a = surface({ entryOnly: new Set(["parse"]), widened: new Set(["parse"]) });
  const b = surface({ entryOnly: new Set(), widened: new Set() });
  assert.deepEqual(diffSurfaces(a, b, "use safeParse instead").documentedRemovals, []);
  assert.deepEqual(diffSurfaces(a, b, "call parse(x)").documentedRemovals, ["parse"]);
});

function report(over: Partial<DriftReport>): DriftReport {
  return {
    package: "demo",
    from: { version: "3.0.0", major: 3, published: "" },
    to: { version: "4.0.0", major: 4, published: "" },
    majorAgeMonths: 6,
    mode: "entry-only",
    fromCount: 10,
    toCount: 9,
    removed: [],
    withoutRunway: [],
    removedFromEntry: [],
    documentedRemovals: [],
    valueRemovals: [],
    readable: true,
    ...over,
  };
}

test("the headline narrows: documented, then values, then everything", () => {
  // A model writes a hook far more often than it writes a type name, so a
  // 127-name diff leads with the handful that were callable.
  assert.deepEqual(
    headlineRemovals(
      report({ documentedRemovals: ["useThing"], valueRemovals: ["useThing"], removedFromEntry: ["useThing", "T"] }),
    ),
    ["useThing"],
  );
  assert.deepEqual(
    headlineRemovals(report({ valueRemovals: ["useThing"], removedFromEntry: ["useThing", "T"] })),
    ["useThing"],
  );
  assert.deepEqual(headlineRemovals(report({ removedFromEntry: ["T"] })), ["T"]);
  assert.deepEqual(headlineRemovals(report({ withoutRunway: ["Deep"] })), ["Deep"]);
});

test("the drift window closes — an old major is not worth scoring", () => {
  // Age of the major predicts drift better than the size of the change:
  // Apollo v4 scored 0/12 once it had been out long enough, and zustand v5 was
  // fully absorbed by ~19 months.
  const fresh = driftVerdict(report({ documentedRemovals: ["useThing"], majorAgeMonths: 4 }));
  assert.equal(fresh.worth, true);
  const stale = driftVerdict(report({ documentedRemovals: ["useThing"], majorAgeMonths: 26 }));
  assert.equal(stale.worth, false);
  assert.match(stale.reason, /models have absorbed it/);
});

test("a clean deprecate-then-remove major is not worth scoring, and says why", () => {
  const v = driftVerdict(report({ removed: ["retired"], withoutRunway: [] }));
  assert.equal(v.worth, false);
  assert.match(v.reason, /deprecated first/);
});

test("a value removal outranks a type removal, and merged declarations count as values", () => {
  const src = `
export declare function useThing(): void;
export interface ThingOptions { a: string }
export declare const VERSION: string;
export type Thing = { a: string };
export declare class Store {}
`;
  const a = surface({
    entryOnly: new Set(["useThing", "ThingOptions", "VERSION", "Thing", "Store"]),
    widened: new Set(["useThing", "ThingOptions", "VERSION", "Thing", "Store"]),
    sources: [src],
  });
  const b = surface({ entryOnly: new Set(), widened: new Set() });
  assert.deepEqual(diffSurfaces(a, b, "").valueRemovals, ["Store", "VERSION", "useThing"]);
});

test("a package whose declarations cannot be read gets no verdict at all", () => {
  // stripe declares itself with an ambient `declare module 'stripe'` block, so
  // the ES-export reader finds 2 symbols on one side and 1131 on the other and
  // would otherwise print a confident "nothing was removed".
  const ambient = 'declare module "stripe" {\n  namespace Stripe { interface Charge {} }\n}';
  const a = surface({ entryOnly: new Set(["Stripe"]), widened: new Set(["Stripe"]), sources: [ambient] });
  const b = surface({
    entryOnly: new Set(["Stripe", "a", "b", "c", "d", "e"]),
    widened: new Set(["Stripe", "a", "b", "c", "d", "e"]),
  });
  const d = diffSurfaces(a, b, "");
  assert.equal(d.readable, false);
  assert.match(d.unreadableReason!, /ambient `declare module`/);
  const v = driftVerdict(report({ ...d, package: "stripe" }));
  assert.equal(v.worth, false);
  assert.match(v.reason, /could not be read/);
});

test("a package with a real surface on both sides stays readable", () => {
  const a = surface({
    entryOnly: new Set(["a", "b", "c", "d", "e", "f"]),
    widened: new Set(["a", "b", "c", "d", "e", "f"]),
  });
  const b = surface({ entryOnly: new Set(["a", "b", "c", "d", "e"]), widened: new Set(["a", "b", "c", "d", "e"]) });
  assert.equal(diffSurfaces(a, b, "").readable, true);
});
