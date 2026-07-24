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
};
