// Shared types for the SDKProof harness.
// The pipeline flows: LibrarySpec -> Task[] -> Candidate[] -> Verdict[] -> Result

export interface LibrarySpec {
  /** short id, e.g. "prisma" */
  id: string;
  /** the import name models are expected to use, e.g. "@prisma/client" */
  packageName: string;
  /** human name, e.g. "Prisma" */
  displayName: string;
  /** absolute path to the sandbox fixture dir */
  fixtureDir: string;
  /** one-line steer for task generation */
  docsHint: string;
}

export type Difficulty = "easy" | "medium" | "hard";

export interface Task {
  id: string;
  /** feature area, e.g. "crud" | "relations" | "transactions" | "pagination" */
  area: string;
  difficulty: Difficulty;
  /** natural-language instruction given to the model */
  prompt: string;
  /** TS skeleton the solution must complete; forces real library usage */
  skeleton: string;
}

/** model identifier, resolved to a concrete API model id at generation time */
export type ModelId = string;

export interface Candidate {
  taskId: string;
  model: ModelId;
  /** full TypeScript source produced by the model */
  code: string;
}

export interface TscError {
  /** diagnostic code, e.g. "TS2339" */
  code: string;
  message: string;
  line: number;
  column: number;
  /** true if the error references the target library's API surface */
  libraryRelated: boolean;
}

export interface Verdict {
  taskId: string;
  model: ModelId;
  /** true iff the candidate type-checks clean against the real installed package */
  passed: boolean;
  errors: TscError[];
}

export type FailureCategory =
  | "hallucinated-member"
  | "wrong-arguments"
  | "bad-import"
  | "type-mismatch"
  | "deprecated-or-removed"
  | "other";

export interface FailurePattern {
  category: FailureCategory;
  count: number;
  example: {
    taskId: string;
    model: ModelId;
    message: string;
    snippet?: string;
  };
}

export interface ModelScore {
  model: ModelId;
  passed: number;
  total: number;
  /** 0-100 */
  score: number;
}

/**
 * A task the model would not attempt. Refusals are stochastic on ordinary SDK
 * tasks (measured 2026-08-04 on Stripe), and they are NOT library drift — the
 * model never wrote code, so nothing was measured. They are excluded from the
 * score and reported separately so a thin board is visibly thin.
 */
export interface Refusal {
  taskId: string;
  model: ModelId;
  /** how many times the identical prompt was re-sampled before giving up */
  attempts: number;
}

export interface Result {
  library: string;
  libraryVersion: string;
  /** ISO timestamp */
  generatedAt: string;
  /** 0-100 across all models */
  overallScore: number;
  perModel: ModelScore[];
  failurePatterns: FailurePattern[];
  verdicts: Verdict[];
  /** tasks the model refused outright; excluded from every score above */
  refusals: Refusal[];
}
