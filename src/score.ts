import type { ModelScore, Result, Verdict } from "./types.ts";
import { classify } from "./classify.ts";

/** Aggregate verdicts into a per-model + overall score with ranked failures. */
export function score(
  library: string,
  libraryVersion: string,
  generatedAt: string,
  verdicts: Verdict[],
): Result {
  const models = [...new Set(verdicts.map((v) => v.model))].sort();
  const perModel: ModelScore[] = models.map((model) => {
    const forModel = verdicts.filter((v) => v.model === model);
    const passed = forModel.filter((v) => v.passed).length;
    const total = forModel.length;
    return {
      model,
      passed,
      total,
      score: total ? Math.round((100 * passed) / total) : 0,
    };
  });

  const passedAll = verdicts.filter((v) => v.passed).length;
  const overallScore = verdicts.length
    ? Math.round((100 * passedAll) / verdicts.length)
    : 0;

  return {
    library,
    libraryVersion,
    generatedAt,
    overallScore,
    perModel,
    failurePatterns: classify(verdicts),
    verdicts,
  };
}
