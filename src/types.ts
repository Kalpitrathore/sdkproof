// Shared types for the SDKProof harness.
// The pipeline flows: LibrarySpec -> Task[] -> Candidate[] -> Verdict[] -> Result
//
// The measurement types live in `packages/cli/src/core/types.ts`, which is what
// ships to npm as `sdkproof`. Only the bench-specific ones — a curated library
// and the agent context it publishes for itself — are declared here.

export type {
  ArmScore,
  Candidate,
  Difficulty,
  FailureCategory,
  FailurePattern,
  LostTask,
  ModelId,
  ModelScore,
  PromptTarget,
  Recommendation,
  Refusal,
  Result,
  Task,
  TscError,
  Verdict,
  VerifyTarget,
} from "../packages/cli/src/core/types.ts";

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

/**
 * A library on the bench. Structurally a `VerifyTarget` and a `PromptTarget`,
 * so it can be handed straight to the shared core.
 */
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
