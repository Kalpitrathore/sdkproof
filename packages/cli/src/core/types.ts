// Shared types for the SDKProof measurement core.
// The pipeline flows: Task[] -> Candidate[] -> Verdict[] -> Result
//
// This file is the single source of truth for both the published CLI
// (packages/cli) and the research bench at the repo root — the root's
// src/types.ts re-exports it. Keeping one copy is not tidiness: the CLI and the
// bench publish numbers that are compared against each other, and two drifting
// copies of `API_SHAPE_CODES` or the pass rule would make those numbers
// incomparable while still looking identical.

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

/** A context arm's outcome, alongside the bare score it is compared against. */
export interface ArmScore {
  name: string;
  label: string;
  passed: number;
  total: number;
  /** 0-100, over the comparable task subset */
  score: number;
  /** the bare score over that SAME subset — never the headline bare score */
  baselineScore: number;
  /** score minus baselineScore, the number a maintainer actually wants */
  delta: number;
  /** how many tasks every arm and the bare run all produced code for */
  comparedOn: number;
  /** trials per task; total = comparedOn x trials */
  trials: number;
  /** task ids this arm still fails — the list a maintainer's docs have not closed */
  failed: string[];
  /** task ids this arm fixes that the bare run got wrong — what the docs bought */
  fixed: string[];
}

export interface Recommendation {
  id: string;
  severity: "high" | "medium" | "info";
  title: string;
  detail: string;
  /** never empty — an item without a measurement behind it is not emitted */
  evidence: string[];
}

export interface LostTask {
  taskId: string;
  model: string;
  /** first line of the underlying error, e.g. a 529 overloaded_error */
  reason: string;
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
  /**
   * Tasks that never produced a candidate because generation errored out —
   * API overload, timeout, transport. NOT refusals: the model never said no,
   * the request never landed. Recorded because a lost task silently shrinks
   * the denominator, and a partial run that drops the HARD tasks scores
   * higher than the real one. Seen 2026-08-05 (an overloaded arm scored high
   * because overload took its hardest tasks away) and again 2026-08-18, when
   * four react-table runs each lost half their tasks and the scorecard still
   * printed "no task was refused, so both rates run over the same set".
   */
  lost?: LostTask[];
  /** present only on a --with-context run: the same tasks scored with the library's own agent files */
  contextArms?: ArmScore[];
  /** derived changes a maintainer could make; every one carries its evidence */
  recommendations?: Recommendation[];
}

/**
 * What verify() needs to know about the thing being scored. The bench passes a
 * full LibrarySpec (which is structurally assignable); the CLI passes a
 * throwaway npm workspace it just built for an arbitrary package.
 */
export interface VerifyTarget {
  /** the import name models are expected to use, e.g. "@prisma/client" */
  packageName: string;
  /** absolute path to the directory holding tsconfig.json and the candidate file */
  fixtureDir: string;
  /**
   * The file the candidate is written to, default `candidate.ts`.
   *
   * A React-facing package needs `candidate.tsx`, because a model asked for a
   * table or a form writes a component and JSX is a syntax error in a `.ts`
   * file — 125 diagnostics on the first @tanstack/react-table run, none of them
   * about the library. It is not the default: in a `.tsx` file `<T>(x) => x`
   * parses as JSX, so a non-React package would break the other way.
   */
  candidateFile?: string;
}

/**
 * What buildUserPrompt() needs about the thing being scored. Kept structural
 * for the same reason as VerifyTarget: the bench passes a LibrarySpec, the CLI
 * passes a description it assembled from the npm registry.
 */
export interface PromptTarget {
  /** human name, e.g. "Prisma" */
  displayName: string;
  /** the import name models are expected to use, e.g. "@prisma/client" */
  packageName: string;
  /** one-line steer for generation — what the library is and what it covers */
  docsHint: string;
}
