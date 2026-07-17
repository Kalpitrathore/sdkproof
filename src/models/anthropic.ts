import Anthropic from "@anthropic-ai/sdk";
import type { GenerateRequest, ModelAdapter } from "./types.ts";

/**
 * Claude adapter. Model defaults to claude-opus-4-8 (the current flagship
 * coding model). No temperature is set — sampling params are rejected on
 * Opus 4.8. Thinking is omitted (single-shot generation); the system prompt
 * forces code-only output.
 */
export function anthropicAdapter(model = "claude-opus-4-8"): ModelAdapter {
  const client = new Anthropic();
  return {
    id: model,
    async generate({ system, user, maxTokens = 4096 }: GenerateRequest): Promise<string> {
      const res = await client.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      });
      return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
    },
  };
}
