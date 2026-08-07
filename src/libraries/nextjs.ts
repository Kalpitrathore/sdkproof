import { fileURLToPath } from "node:url";
import path from "node:path";
import type { LibrarySpec } from "../types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export const nextjsSpec: LibrarySpec = {
  id: "nextjs",
  packageName: "next",
  displayName: "Next.js",
  fixtureDir: path.resolve(here, "../../fixtures/nextjs"),
  // Names the App Router server helpers but NOT their signatures — in particular
  // whether cookies()/headers()/draftMode() are sync or async. That (and the
  // rest) is what we're measuring.
  docsHint:
    "Next.js App Router server code — the `next` package. " +
    'Read request state with cookies() / headers() / draftMode() from "next/headers", ' +
    'control flow with redirect() / notFound() from "next/navigation", ' +
    'build Route Handlers with NextRequest / NextResponse from "next/server", ' +
    'and revalidate caches with revalidatePath() / revalidateTag() from "next/cache". ' +
    "Write plain server functions and Route Handlers — no JSX, no React components.",
  // Next.js serves a .md alongside every docs page. This one states the v16
  // signature outright, and at 6.6 KB it sits between the ~100-byte arms that
  // work and the ~25 KB packs that do not — so it tests size, not wording.
  agentContext: {
    source: "nextjs.org/docs/app/api-reference/functions/revalidateTag.md, fetched 2026-08-07",
    dir: path.resolve(here, "../../fixtures/nextjs/agent-context"),
    arms: [
      { name: "only", label: "the sentence alone, 137 B", files: ["minimal.md"] },
      { name: "first-25k", label: "the same sentence first, then 25 KB of unrelated Next.js docs", files: ["sweep-first-25k.md"] },
      { name: "last-25k", label: "the same 25 KB first, sentence last", files: ["sweep-last-25k.md"] },
      { name: "first-50k", label: "sentence first, then 50 KB", files: ["sweep-first-50k.md"] },
    ],
  },
};
