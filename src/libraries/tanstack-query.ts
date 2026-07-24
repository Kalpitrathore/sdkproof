import { fileURLToPath } from "node:url";
import path from "node:path";
import type { LibrarySpec } from "../types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export const tanstackQuerySpec: LibrarySpec = {
  id: "tanstack-query",
  packageName: "@tanstack/react-query",
  displayName: "TanStack Query",
  fixtureDir: path.resolve(here, "../../fixtures/tanstack-query"),
  // Names the building blocks but NOT the drift-prone v5 signatures — object-only
  // useQuery, the pending status literal, gcTime, placeholderData/keepPreviousData,
  // useInfiniteQuery's initialPageParam — that's what we're measuring.
  docsHint:
    'TanStack Query (React Query) — the `@tanstack/react-query` package. ' +
    'Import { useQuery, useMutation, useInfiniteQuery, QueryClient } from "@tanstack/react-query". ' +
    "Fetch and cache server state with useQuery, mutate with useMutation, page with useInfiniteQuery, " +
    "configure caching with new QueryClient(...), and read state from the returned query object. " +
    "Write plain functions/hooks that call the APIs — no JSX, no React components.",
};
