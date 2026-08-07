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
  // React Router publishes nothing for agents — reactrouter.com/llms.txt is 404.
  // But its repo contains a user-facing skill pack whose framework-mode.md states
  // the exact fix for the one task this library fails. These files are NOT shipped;
  // scoring them tests whether publishing them would work, which is the
  // recommendation already on the scorecard. See PROVENANCE.md.
  agentContext: {
    source: "remix-run/react-router .agents/skills/react-router — in the repo, NOT shipped to users",
    dir: path.resolve(here, "../../fixtures/react-router/agent-context"),
    arms: [
      {
        name: "just-the-line",
        label: "only the one sentence from framework-mode.md, ~75 characters",
        files: ["minimal.md"],
      },
      {
        name: "metadata-only",
        label: "just the Metadata section that contains it, 215 B",
        files: ["metadata-only.md"],
      },
      {
        name: "framework-only",
        label: "the whole file it lives in — 7.3 KB, all about routing",
        files: ["references/framework-mode.md"],
      },
      {
        name: "full-pack",
        label: "plus the four mode references, one of which names the meta rename",
        files: [
          "SKILL.md",
          "references/framework-mode.md",
          "references/data-mode.md",
          "references/declarative-mode.md",
          "references/rsc.md",
        ],
      },
    ],
  },
};
