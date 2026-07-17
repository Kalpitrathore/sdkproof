import { anthropicAdapter } from "./anthropic.ts";
import { openaiAdapter } from "./openai.ts";
import type { ModelAdapter } from "./types.ts";

/** Build the list of live model adapters from the API keys present in env. */
export function activeAdapters(): ModelAdapter[] {
  const out: ModelAdapter[] = [];
  // ANTHROPIC_AUTH_TOKEN also works (e.g. an OAuth token from `ant auth login`).
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
    out.push(anthropicAdapter());
  }
  if (process.env.OPENAI_API_KEY) out.push(openaiAdapter());
  return out;
}
