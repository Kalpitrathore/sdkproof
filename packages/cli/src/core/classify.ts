import type { FailureCategory, FailurePattern, Verdict } from "./types.ts";

// Map tsc diagnostic codes to human failure categories.
const CODE_CATEGORY: Record<string, FailureCategory> = {
  TS2339: "hallucinated-member", // property does not exist
  TS2551: "hallucinated-member", // property does not exist — did you mean
  TS2353: "hallucinated-member", // invented object-literal field
  TS2561: "hallucinated-member",
  TS2694: "hallucinated-member",
  // The three canonical shapes of "you imported the API that used to be here":
  // the member moved entrypoint (TS2305), the same with a did-you-mean attached
  // (TS2724), or the default export is gone (TS1192).
  //
  // TS2305 and TS1192 were added to API_SHAPE_CODES on 2026-08-13 but never
  // here, so they fell through to "other" — and "other" is what the scorecard
  // prints as the top failure pattern. Apollo Client 4, this project's flagship
  // finding, publishes "other: 4" for four TS2305s that are the entire point of
  // the measurement. Found 2026-08-18 re-scoring the AI SDK, whose scorecard
  // led with "other: 13x".
  //
  // TS2724 moves with them: it is TS2305 with a suggestion attached, and
  // splitting one error family across two categories is the same inconsistency
  // the 08-13 fix was about. `deprecated-or-removed` was declared in
  // FailureCategory and mapped from nothing; for a harness whose whole subject
  // is removed and moved APIs, it is the accurate label for all three.
  TS2305: "deprecated-or-removed",
  TS2724: "deprecated-or-removed",
  TS1192: "deprecated-or-removed",
  TS2554: "wrong-arguments", // wrong number of arguments
  TS2345: "wrong-arguments", // argument type not assignable
  // The same family one level up: the call or the generic was handed the wrong
  // shape. Unmapped until 2026-08-22, when a `zod` run through the published
  // CLI reported "other: 2x" for two TS2769s that were the whole finding —
  // the identical failure the 08-18 note describes for TS2305.
  TS2769: "wrong-arguments", // no overload matches this call
  TS2314: "wrong-arguments", // generic type requires N type argument(s)
  TS2558: "wrong-arguments", // expected N type arguments, but got M
  TS2707: "wrong-arguments", // generic type requires between N and M type arguments
  TS2347: "wrong-arguments", // untyped function calls may not accept type arguments
  TS2559: "type-mismatch", // no properties in common
  TS2322: "type-mismatch", // type not assignable
  TS2307: "bad-import", // cannot find module
};

export function categorize(code: string): FailureCategory {
  return CODE_CATEGORY[code] ?? "other";
}

/** Bucket every error across all verdicts into ranked failure patterns. */
export function classify(verdicts: Verdict[]): FailurePattern[] {
  const byCategory = new Map<FailureCategory, FailurePattern>();
  for (const v of verdicts) {
    for (const e of v.errors) {
      const category = categorize(e.code);
      const existing = byCategory.get(category);
      if (existing) {
        existing.count += 1;
      } else {
        byCategory.set(category, {
          category,
          count: 1,
          example: { taskId: v.taskId, model: v.model, message: e.message },
        });
      }
    }
  }
  // "other" is the residual bucket and must never lead the scorecard. Ranking
  // purely by count let it: a single failed type import produces one TS2305
  // plus one TS7031 per parameter that lost its annotation, so on the AI SDK
  // the DOWNSTREAM noise (11x "implicitly has an 'any' type") outranked the
  // four removed types that caused it. The consequence was printed as the
  // headline and the cause was printed underneath.
  return [...byCategory.values()].sort(
    (a, b) => Number(a.category === "other") - Number(b.category === "other") || b.count - a.count,
  );
}
