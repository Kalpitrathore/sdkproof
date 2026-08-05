// Shared types for the SDKProof harness.
// The pipeline flows: LibrarySpec -> Task[] -> Candidate[] -> Verdict[] -> Result

/**
 * One arm of a context-aware run: a named subset of the agent files a library
 * ships. Arms exist because agents route to skills BY NAME, so the pack whose
 * name matches the task is not necessarily the pack that carries the answer —
 * measured on Prisma 2026-07-31, the name-matched pack scored 2/9 where the
 * setup docs scored 7/9. That gap is a finding a maintainer can act on, and it
 * is invisible if the library's whole context tree is loaded as one blob.
 */
export interface ContextArm {
  /** short id, e.g. "client-api" */
  name: string;
  /** one line for the scorecard, e.g. "the pack an agent routes to by name" */
  label: string;
  /** files relative to the context dir, in the order an agent would meet them */
  files: string[];
}

/**
 * The agent context a library ships for itself — skills, AGENTS.md, llms.txt.
 * Scoring twice, bare and with this, turns "how well does the model know your
 * API" (which a maintainer cannot change) into "do the docs you ship actually
 * work" (which they can).
 */
export interface AgentContextSpec {
  /** provenance line rendered on the scorecard — what shipped these and at what version */
  source: string;
  /** absolute path to the committed copy of those files */
  dir: string;
  arms: ContextArm[];
}

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
  /** optional: the library's own shipped agent context, for a second scoring arm */
  agentContext?: AgentContextSpec;
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
  /** task ids this arm still fails — the list a maintainer's docs have not closed */
  failed: string[];
  /** task ids this arm fixes that the bare run got wrong — what the docs bought */
  fixed: string[];
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
  /** present only on a --with-context run: the same tasks scored with the library's own agent files */
  contextArms?: ArmScore[];
}
