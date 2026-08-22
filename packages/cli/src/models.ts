import type { GenerateRequest, ModelAdapter } from "./core/model.ts";
import { FatalApiError, RefusalError } from "./core/model.ts";

/** Stochastic refusals on benign SDK tasks; re-sample the same prompt this many times. */
const REFUSAL_ATTEMPTS = 4;
/** Transient server errors (529 overloaded, 429 rate limit) — retried with backoff. */
const TRANSIENT_ATTEMPTS = 5;

/**
 * Set once a fatal error is seen, so in-flight siblings fail instantly instead
 * of each making its own doomed request.
 */
let fatal: string | null = null;

/** Reset between runs; only the test suite and long-lived embeddings need this. */
export function clearFatal(): void {
  fatal = null;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function post(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new ApiError(res.status, `${res.status} ${text.slice(0, 400)}`);
    return JSON.parse(text) as Record<string, any>;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Retry the transient failures and stop dead on the terminal ones.
 *
 * A 529/429 is the API being busy, not the model saying anything. Left
 * unretried it drops a task from the run — and a dropped task silently shrinks
 * the denominator, which on 2026-08-05 scored a context arm HIGHER than bare
 * simply because overload took its hardest tasks away. A 401/403, or a 400
 * about billing, is terminal for every remaining request: retrying it just
 * spends the rest of the run failing.
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let t = 1; ; t++) {
    if (fatal) throw new FatalApiError(fatal);
    try {
      return await fn();
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      const msg = String((e as Error).message ?? "");
      if (status === 401 || status === 403 || (status === 400 && /credit balance|billing|quota/i.test(msg))) {
        fatal = msg.slice(0, 200);
        throw new FatalApiError(fatal);
      }
      const transient = status === 429 || status >= 500 || /aborted|ETIMEDOUT|ECONNRESET|fetch failed/i.test(msg);
      if (!transient || t === TRANSIENT_ATTEMPTS) throw e;
      await new Promise((r) => setTimeout(r, 1500 * 2 ** (t - 1)));
    }
  }
}

/**
 * Claude adapter over the raw Messages API — no SDK, so `npx sdkproof` installs
 * one dependency (typescript) instead of a tree.
 *
 * ANTHROPIC_AUTH_TOKEN is accepted alongside ANTHROPIC_API_KEY because an OAuth
 * token from a Claude subscription is the key most people already have.
 */
export function anthropicAdapter(model: string): ModelAdapter {
  const base = process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com";
  const key = process.env.ANTHROPIC_API_KEY;
  const token = process.env.ANTHROPIC_AUTH_TOKEN;
  return {
    id: model,
    async generate({ system, user, maxTokens = 16000 }: GenerateRequest): Promise<string> {
      if (fatal) throw new FatalApiError(fatal);
      // Both guards below exist because either failure used to arrive as an
      // EMPTY candidate, and an empty file compiles clean — so a generation
      // failure was scored as a perfect answer. Found 2026-08-04 on the first
      // Stripe run, which reported 100/100 with four of fifteen candidates blank.
      for (let attempt = 1; attempt <= REFUSAL_ATTEMPTS; attempt++) {
        const res = await withRetry(() =>
          post(
            `${base}/v1/messages`,
            {
              "anthropic-version": "2023-06-01",
              ...(key ? { "x-api-key": key } : {}),
              ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
            { model, max_tokens: maxTokens, system, messages: [{ role: "user", content: user }] },
            300_000,
          ),
        );

        // A truncated completion loses its closing fence, so extraction returns
        // a fragment or nothing. That is a harness problem, not model drift.
        if (res.stop_reason === "max_tokens") {
          throw new Error(
            `generation truncated at max_tokens=${maxTokens} — raise it with --max-tokens or shorten the task`,
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

        const blocks = (res.content ?? []) as Array<{ type: string; text?: string }>;
        return blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n");
      }
      throw new Error("unreachable");
    },
  };
}

/** GPT adapter over the raw Chat Completions API. */
export function openaiAdapter(model: string): ModelAdapter {
  const base = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  return {
    id: model,
    async generate({ system, user, maxTokens = 16000 }: GenerateRequest): Promise<string> {
      if (fatal) throw new FatalApiError(fatal);
      const res = await withRetry(() =>
        post(
          `${base}/chat/completions`,
          { authorization: `Bearer ${process.env.OPENAI_API_KEY ?? ""}` },
          {
            model,
            max_completion_tokens: maxTokens,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          },
          300_000,
        ),
      );
      const choice = res.choices?.[0];
      // Same guard as Anthropic's max_tokens: a cut-off completion is a harness
      // failure, and it must not reach verify() as an empty candidate.
      if (choice?.finish_reason === "length") {
        throw new Error(
          `generation truncated at max_completion_tokens=${maxTokens} — raise it with --max-tokens or shorten the task`,
        );
      }
      if (choice?.message?.refusal) {
        throw new RefusalError(1);
      }
      return choice?.message?.content ?? "";
    },
  };
}

export interface ModelRef {
  provider: "anthropic" | "openai";
  model: string;
}

export const DEFAULT_ANTHROPIC_MODEL = process.env.SDKPROOF_ANTHROPIC_MODEL ?? "claude-opus-5";
export const DEFAULT_OPENAI_MODEL = process.env.SDKPROOF_OPENAI_MODEL ?? "gpt-5";

/**
 * Turn a `--model` value into a provider + model id. Accepts an explicit
 * `anthropic:<id>` / `openai:<id>`, or a bare id whose provider is inferred
 * from its prefix — so `--model claude-sonnet-5` and `--model gpt-5` both work.
 */
export function parseModelRef(value: string): ModelRef {
  const [head, ...rest] = value.split(":");
  if (rest.length && (head === "anthropic" || head === "openai")) {
    return { provider: head, model: rest.join(":") };
  }
  if (/^claude/i.test(value)) return { provider: "anthropic", model: value };
  if (/^(gpt|o\d)/i.test(value)) return { provider: "openai", model: value };
  throw new Error(
    `cannot tell which provider "${value}" belongs to — write it as anthropic:<id> or openai:<id>`,
  );
}

export function adapterFor(ref: ModelRef): ModelAdapter {
  return ref.provider === "anthropic" ? anthropicAdapter(ref.model) : openaiAdapter(ref.model);
}

export function hasKeyFor(provider: ModelRef["provider"]): boolean {
  return provider === "anthropic"
    ? Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN)
    : Boolean(process.env.OPENAI_API_KEY);
}

/** Every model the environment holds a key for, when --model was not given. */
export function defaultAdapters(): ModelAdapter[] {
  const out: ModelAdapter[] = [];
  if (hasKeyFor("anthropic")) out.push(anthropicAdapter(DEFAULT_ANTHROPIC_MODEL));
  if (hasKeyFor("openai")) out.push(openaiAdapter(DEFAULT_OPENAI_MODEL));
  return out;
}
