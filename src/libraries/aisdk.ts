import { fileURLToPath } from "node:url";
import path from "node:path";
import type { LibrarySpec } from "../types.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

export const aisdkSpec: LibrarySpec = {
  id: "aisdk",
  packageName: "ai",
  displayName: "Vercel AI SDK",
  fixtureDir: path.resolve(here, "../../fixtures/aisdk"),
  // Names the functions and the provider, but deliberately NOT the drift-prone
  // option names (maxOutputTokens / inputSchema) — that's what we're measuring.
  docsHint:
    "Vercel AI SDK — the `ai` package — with the OpenAI provider (`@ai-sdk/openai`) and zod. " +
    "Use the core functions generateText, streamText, generateObject, embed, and the `tool` helper. " +
    'Get a model with openai("gpt-4o").',
};
