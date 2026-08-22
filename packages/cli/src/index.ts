/**
 * Programmatic entrypoint. Everything the CLI does is available here, so a
 * project can score its own package in CI without shelling out.
 */
export { run, parseSpec, type RunOptions, type RunOutcome } from "./run.ts";
export { computeDrift, driftVerdict, type DriftReport, type DriftOptions } from "./drift.ts";
export { surfaceOf, symbolsFromSource, isDeprecated, type Surface } from "./surface.ts";
export {
  fetchPackument, resolveVersion, majorLines, readmeFor, requiredPeers,
  type Packument, type VersionMeta, type MajorLine,
} from "./registry.ts";
export { prepareWorkspace, resolveTsc, cacheRoot, type Workspace } from "./workspace.ts";
export { synthesizeTasks, loadTaskFile, validateTasks, type TaskSet } from "./tasks.ts";
export { renderTerminal, renderMarkdown, renderDrift, type RunContext } from "./report.ts";
export {
  anthropicAdapter, openaiAdapter, adapterFor, defaultAdapters, parseModelRef,
  type ModelRef,
} from "./models.ts";
export { verify, parseDiagnostics, augmentsLibrary, API_SHAPE_CODES } from "./core/verify.ts";
export { score } from "./core/score.ts";
export { classify, categorize } from "./core/classify.ts";
export { buildUserPrompt, extractCode, GENERATION_SYSTEM } from "./core/prompt.ts";
export { wilson, rates, fmtInterval } from "./core/stats.ts";
export type * from "./core/types.ts";
export { RefusalError, FatalApiError, type ModelAdapter, type GenerateRequest } from "./core/model.ts";
