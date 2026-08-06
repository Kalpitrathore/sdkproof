import Anthropic from "@anthropic-ai/sdk";
import type { GenerateRequest, ModelAdapter } from "./types.ts";
import { FatalApiError, RefusalError } from "./types.ts";

/** Stochastic refusals on benign SDK tasks; re-sample the same prompt this many times. */
const REFUSAL_ATTEMPTS = 4;
/** Transient server errors (529 overloaded, 429 rate limit) — retried with backoff. */
const TRANSIENT_ATTEMPTS = 5;

/**
 * Claude adapter. Model defaults to claude-opus-5 (the current flagship
 * coding model). No temperature is set — sampling params are rejected on
 * the 5-family. Thinking is omitted (single-shot generation); the system
 * prompt forces code-only output.
 */
/**
 * Set once a fatal error is seen, so in-flight siblings fail instantly instead
 * of each making its own doomed request.
 */
let fatal: string | null = null;

export function anthropicAdapter(model = "claude-opus-5"): ModelAdapter {
  const client = new Anthropic();
  return {
    id: model,
    async generate({ system, user, maxTokens = 16000 }: GenerateRequest): Promise<string> {
      if (fatal) throw new FatalApiError(fatal);
      // Both guards exist because either failure used to arrive as an EMPTY
      // candidate, and an empty file compiles clean — so a generation failure
      // was scored as a perfect answer. Found 2026-08-04 on the first Stripe
      // run, which reported 100/100 with four of fifteen candidates blank.
      for (let attempt = 1; attempt <= REFUSAL_ATTEMPTS; attempt++) {
        // A 529/429 is the API being busy, not the model saying anything. Left
        // unretried it drops a task from the run — and on 2026-08-05 that scored
        // a context arm higher than bare simply because overload took its hardest
        // tasks away. Same shape as an empty candidate passing: a failure that
        // improves the number.
        let res;
        for (let t = 1; ; t++) {
          try {
            res = await client.messages.create({
              model,
              max_tokens: maxTokens,
              system,
              messages: [{ role: "user", content: user }],
            });
            break;
          } catch (e) {
            const status = (e as { status?: number }).status;
            const msg = String((e as Error).message ?? "");
            // Terminal for the whole run: no credit, bad key. Stop, do not retry.
            if (status === 400 && /credit balance|billing/i.test(msg)) {
              fatal = msg.slice(0, 160);
              throw new FatalApiError(fatal);
            }
            if (status === 401 || status === 403) {
              fatal = msg.slice(0, 160);
              throw new FatalApiError(fatal);
            }
            if ((status !== 529 && status !== 429) || t === TRANSIENT_ATTEMPTS) throw e;
            await new Promise((r) => setTimeout(r, 1500 * 2 ** (t - 1)));
          }
        }

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
          if (attempt === REFUSAL_ATTEMPTS) throw new RefusalError(REFUSAL_ATTEMPTS);
          continue;
        }

        return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n");
      }
      throw new Error("unreachable");
    },
  };
}
