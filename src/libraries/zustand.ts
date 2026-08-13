import { fileURLToPath } from "node:url";
import path from "node:path";
import type { LibrarySpec } from "../types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export const zustandSpec: LibrarySpec = {
  id: "zustand",
  packageName: "zustand",
  displayName: "Zustand",
  fixtureDir: path.resolve(here, "../../fixtures/zustand"),
  // Names the store builder and the concepts, but never says whether `create`
  // is a default or a named export, and never mentions createWithEqualityFn —
  // v5 removed the default export and moved custom equality out of `create`,
  // and which one the model reaches for is what we are measuring.
  docsHint:
    "Zustand state management — the `zustand` package. " +
    "Build a hook-based store with create(), read and update it with set/get, " +
    "read outside React with store.getState(), and select slices with an equality function.",
};
