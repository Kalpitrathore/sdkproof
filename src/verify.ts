/**
 * Type-check a candidate against the real installed package.
 *
 * The implementation lives in `packages/cli/src/core/`, which is the code
 * published to npm as `sdkproof`. The bench re-exports it rather than keeping a
 * second copy: the CLI and the bench publish numbers that get compared with
 * each other, and two drifting definitions of "passed" would make those numbers
 * incomparable while still looking identical.
 */
export { verify, augmentsLibrary, parseDiagnostics, API_SHAPE_CODES } from "../packages/cli/src/core/verify.ts";
export type { VerifyOptions } from "../packages/cli/src/core/verify.ts";
