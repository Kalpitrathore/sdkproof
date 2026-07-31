import { fileURLToPath } from "node:url";
import path from "node:path";
import type { LibrarySpec } from "../types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export const reactRouterSpec: LibrarySpec = {
  id: "react-router",
  packageName: "react-router",
  displayName: "React Router",
  fixtureDir: path.resolve(here, "../../fixtures/react-router"),
  // Names the building blocks but NOT the drift-prone v8 changes — that the
  // react-router-dom package is gone, that json()/defer() were removed, that
  // `context` is a RouterContextProvider rather than a plain object, and that
  // meta receives `loaderData` instead of `data`. That's what we're measuring.
  docsHint:
    'React Router — the `react-router` package. Build data routes with createBrowserRouter, ' +
    "define route loader / action / middleware functions, and read state in components with " +
    "useLoaderData, useActionData, useNavigation, useSubmit, useFetcher, useParams, useSearchParams. " +
    "Redirect with redirect(), attach a status or headers to a returned value with data(), " +
    "and create typed router context with createContext(). " +
    "Write plain functions and hooks that call the APIs — no JSX, no React components.",
};
