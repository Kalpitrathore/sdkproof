export interface GenerateRequest {
  system: string;
  user: string;
  maxTokens?: number;
}

/** A model that generates code for a task. The "agent under test." */
export interface ModelAdapter {
  /** the model id, used as the scorecard column name */
  id: string;
  generate(req: GenerateRequest): Promise<string>;
}

/**
 * Thrown when a model refuses the identical prompt every time it is sampled.
 * Typed so the CLI can record it as a refusal rather than a generic failure —
 * a refusal is an unmeasured task, not a failed one.
 */
export class RefusalError extends Error {
  constructor(readonly attempts: number) {
    super(`model refused this task ${attempts}x — not library drift, excluded from the score`);
    this.name = "RefusalError";
  }
}
