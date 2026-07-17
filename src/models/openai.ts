import OpenAI from "openai";
import type { GenerateRequest, ModelAdapter } from "./types.ts";

/**
 * GPT adapter. The exact model id is configurable via SDKPROOF_OPENAI_MODEL
 * because the current flagship id changes often; set it to the coding model
 * you want to score. Uses max_completion_tokens (the current param name).
 */
export function openaiAdapter(
  model = process.env.SDKPROOF_OPENAI_MODEL ?? "gpt-5",
): ModelAdapter {
  const client = new OpenAI();
  return {
    id: model,
    async generate({ system, user, maxTokens = 4096 }: GenerateRequest): Promise<string> {
      const res = await client.chat.completions.create({
        model,
        max_completion_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
      return res.choices[0]?.message?.content ?? "";
    },
  };
}
