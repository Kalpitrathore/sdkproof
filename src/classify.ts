import type { FailureCategory, FailurePattern, Verdict } from "./types.ts";

// Map tsc diagnostic codes to human failure categories.
const CODE_CATEGORY: Record<string, FailureCategory> = {
  TS2339: "hallucinated-member", // property does not exist
  TS2551: "hallucinated-member", // property does not exist — did you mean
  TS2353: "hallucinated-member", // invented object-literal field
  TS2561: "hallucinated-member",
  TS2724: "hallucinated-member", // no exported member
  TS2694: "hallucinated-member",
  TS2554: "wrong-arguments", // wrong number of arguments
  TS2345: "wrong-arguments", // argument type not assignable
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
  return [...byCategory.values()].sort((a, b) => b.count - a.count);
}
