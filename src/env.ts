import { fileURLToPath } from "node:url";
import path from "node:path";

/** absolute path to the sdkproof project root */
export const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * The TypeScript compiler JS entrypoint. We invoke it with the current node
 * (process.execPath) rather than the .bin/tsc shim, because node may be
 * project-local and not on the spawned process's PATH.
 */
export const tscEntry = path.join(
  projectRoot,
  "node_modules",
  "typescript",
  "bin",
  "tsc",
);
