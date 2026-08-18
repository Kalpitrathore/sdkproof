import { fileURLToPath } from "node:url";
import path from "node:path";
import type { LibrarySpec } from "../types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export const reactTableSpec: LibrarySpec = {
  id: "react-table",
  packageName: "@tanstack/react-table",
  displayName: "TanStack React Table",
  fixtureDir: path.resolve(here, "../../fixtures/react-table"),
  // Names the goals, never the API. v9 renamed the primary hook
  // useReactTable -> useTable, replaced v8's getXRowModel() plumbing with a
  // `features` map, and renamed getPaginationRowModel -> getPaginatedRowModel.
  // Which of those the model reaches for is exactly what we are measuring, so
  // none of them appears here.
  docsHint:
    "TanStack Table for React — the `@tanstack/react-table` package. " +
    "Build a table instance from a columns definition and a data array, enable the features you need " +
    "(sorting, pagination, row selection, filtering, grouping, column visibility), and read rows and " +
    "cell values off the instance. Write plain functions — no JSX, no React components.",
};
