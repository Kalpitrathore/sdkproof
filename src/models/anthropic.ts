import Anthropic from "@anthropic-ai/sdk";
import type { GenerateRequest, ModelAdapter } from "./types.ts";

/** Stochastic refusals on benign SDK tasks; re-sample the same prompt this many times. */
const REFUSAL_ATTEMPTS = 4;

/**
 * Claude adapter. Model defaults to claude-opus-5 (the current flagship
 * coding model). No temperature is set — sampling params are rejected on
 * the 5-family. Thinking is omitted (single-shot generation); the system
 * prompt forces code-only output.
 */
export function anthropicAdapter(model = "claude-opus-5"): ModelAdapter {
  const client = new Anthropic();
  return {
    id: model,
    async generate({ system, user, maxTokens = 16000 }: GenerateRequest): Promise<string> {
      // Both guards exist because either failure used to arrive as an EMPTY
      // candidate, and an empty file compiles clean — so a generation failure
      // was scored as a perfect answer. Found 2026-08-04 on the first Stripe
      // run, which reported 100/100 with four of fifteen candidates blank.
      for (let attempt = 1; attempt <= REFUSAL_ATTEMPTS; attempt++) {
        const res = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
        });

        // A truncated completion loses its closing fence, so extraction returns
        // a fragment or nothing. That is a harness problem, not model drift.
        if (res.stop_reason === "max_tokens") {
          throw new Error(
            `generation truncated at max_tokens=${maxTokens} — raise it or shorten the task`,
          );
        }

        // Refusals are stochastic on ordinary SDK tasks: measured 2026-08-04,
        // the same Stripe prompts came back refusal/end_turn/end_turn and
        // end_turn/refusal/end_turn across three trials, including a task that
        // just lists customers. Re-sampling the identical prompt is the honest
        // response — the prompt is not reworded to avoid the classifier, and a
        // task that refuses every time still fails rather than scoring.
        if (res.stop_reason === "refusal") {
          if (attempt === REFUSAL_ATTEMPTS) {
            throw new Error(
              `model refused this task ${REFUSAL_ATTEMPTS}x — not library drift, exclude it from the score`,
            );
          }
          continue;
        }

        return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
      }
      throw new Error("unreachable");
    },
  };
}
