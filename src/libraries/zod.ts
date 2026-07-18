import { fileURLToPath } from "node:url";
import path from "node:path";
import type { LibrarySpec } from "../types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export const zodSpec: LibrarySpec = {
  id: "zod",
  packageName: "zod",
  displayName: "Zod",
  fixtureDir: path.resolve(here, "../../fixtures/zod"),
  // Names the building blocks but not the drift-prone signatures (record arity,
  // the error-message option, the ip validator) — that's what we're measuring.
  docsHint:
    'Zod schema validation — the `zod` package. Import { z } from "zod". ' +
    "Build schemas with z.object / z.string / z.number / z.array / z.enum / z.record and refinements, " +
    "infer static types with z.infer, and validate with .parse / .safeParse.",
};
