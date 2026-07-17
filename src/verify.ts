import { execFile } from "node:child_process";
import { writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Candidate, LibrarySpec, TscError, Verdict } from "./types.ts";

const execFileAsync = promisify(execFile);

// A tsc "--pretty false" primary diagnostic line:
//   path/candidate.ts(4,22): error TS2551: Property 'createOne' does not exist ...
const DIAG_RE = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/;

// Error codes that indicate misuse of an API surface (a hallucinated/wrong/
// removed member or signature) rather than a generic JS mistake.
const API_SHAPE_CODES = new Set([
  "TS2339", // property does not exist on type
  "TS2551", // property does not exist — did you mean X
  "TS2353", // object literal may only specify known properties (invented field)
  "TS2561", // did you mean to write X
  "TS2554", // wrong number of arguments
  "TS2345", // argument type not assignable
  "TS2322", // type not assignable
  "TS2559", // type has no properties in common with
  "TS2307", // cannot find module (bad import path)
  "TS2724", // module has no exported member
  "TS2694", // namespace has no exported member
]);

export interface VerifyOptions {
  /** JS entrypoint of the tsc compiler (see env.tscEntry) */
  tscEntry: string;
}

/**
 * Type-check a model-generated candidate against the real installed package,
 * inside the library's sandbox fixture. A candidate "passes" iff it compiles
 * clean under the fixture's strict tsconfig.
 */
export async function verify(
  candidate: Candidate,
  spec: LibrarySpec,
  opts: VerifyOptions,
): Promise<Verdict> {
  const candidatePath = path.join(spec.fixtureDir, "candidate.ts");
  const tsconfigPath = path.join(spec.fixtureDir, "tsconfig.json");
  await writeFile(candidatePath, candidate.code, "utf8");
  try {
    const output = await runTsc(opts.tscEntry, tsconfigPath);
    const errors = parseDiagnostics(output, spec);
    return {
      taskId: candidate.taskId,
      model: candidate.model,
      passed: errors.length === 0,
      errors,
    };
  } finally {
    await rm(candidatePath, { force: true });
  }
}

async function runTsc(tscEntry: string, tsconfigPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync(
      process.execPath,
      [tscEntry, "-p", tsconfigPath, "--pretty", "false"],
      { maxBuffer: 16 * 1024 * 1024 },
    );
    return stdout;
  } catch (err) {
    // tsc exits non-zero when it reports errors; diagnostics are on stdout.
    const e = err as { stdout?: string; stderr?: string };
    return (e.stdout ?? "") + (e.stderr ?? "");
  }
}

/** Parse tsc "--pretty false" output into structured errors for the candidate. */
export function parseDiagnostics(output: string, spec: LibrarySpec): TscError[] {
  const errors: TscError[] = [];
  for (const line of output.split(/\r?\n/)) {
    const m = DIAG_RE.exec(line);
    if (!m) continue;
    const [, file, lineNo, colNo, code, message] = m;
    // Only diagnostics in the candidate file reflect the model's code.
    if (!file.includes("candidate.ts")) continue;
    errors.push({
      code,
      message,
      line: Number(lineNo),
      column: Number(colNo),
      libraryRelated: API_SHAPE_CODES.has(code) || message.includes(spec.packageName),
    });
  }
  return errors;
}
