import { execFile } from "node:child_process";
import { writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Candidate, TscError, Verdict, VerifyTarget } from "./types.ts";

const execFileAsync = promisify(execFile);

// A tsc "--pretty false" primary diagnostic line:
//   path/candidate.ts(4,22): error TS2551: Property 'createOne' does not exist ...
const DIAG_RE = /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.*)$/;

// Error codes that indicate misuse of an API surface (a hallucinated/wrong/
// removed member or signature) rather than a generic JS mistake.
export const API_SHAPE_CODES = new Set([
  "TS2339", // property does not exist on type
  "TS2551", // property does not exist — did you mean X
  "TS2353", // object literal may only specify known properties (invented field)
  "TS2561", // did you mean to write X
  "TS2554", // wrong number of arguments
  "TS2345", // argument type not assignable
  "TS2322", // type not assignable
  "TS2559", // type has no properties in common with
  "TS2307", // cannot find module (bad import path)
  "TS2724", // module has no exported member — did you mean X
  "TS2305", // module has no exported member (the member moved entrypoint)
  "TS1192", // module has no default export (the default export was removed)
  "TS2694", // namespace has no exported member
  // The call/type-argument shape changed under the model's feet. All four were
  // landing in the residual bucket while being exactly the thing this harness
  // measures: TS2314 alone accounts for more diagnostics across the bench than
  // any other code, and TS2558 is the third error in the README's own
  // TanStack Table example.
  "TS2769", // no overload matches this call
  "TS2314", // generic type requires N type argument(s)
  "TS2558", // expected N type arguments, but got M
  "TS2707", // generic type requires between N and M type arguments
  "TS2347", // untyped function calls may not accept type arguments
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
  spec: VerifyTarget,
  opts: VerifyOptions,
): Promise<Verdict> {
  // An empty or bodyless candidate compiles clean, so without this it scores as
  // a PASS — a generation failure recorded as a perfect answer. Found on the
  // first Stripe run (2026-08-04): four of fifteen candidates came back empty
  // because the model hit max_tokens, lost its closing fence, and extraction
  // returned nothing. All four "passed" and the library scored 100/100.
  //
  // Every task skeleton asks for an export, so a candidate with no `export`
  // has not answered. That is a harness failure, not model drift, and it is
  // reported with a code outside API_SHAPE_CODES so it can never be counted as
  // a library-drift finding.
  // A candidate may not redefine the library it is being measured against.
  // TypeScript module augmentation ADDS the declared members to the module's
  // exports, so `declare module "react-router" { interface AppLoadContext {} }`
  // re-creates a type v8 deleted and the accompanying import resolves — a
  // candidate written entirely against the REMOVED API compiles clean and
  // scores as a PASS. Found 2026-08-17 probing react-router v8: two of five
  // candidates that reached for the deleted `AppLoadContext` passed, purely
  // because they also wrote the augmentation. The third, which imported it
  // without augmenting, failed with TS2305 as it should.
  //
  // This is the same failure class as an empty candidate passing: the harness
  // converts "the model used the old API" into "the model got it right".
  // SDKP002 is deliberately outside API_SHAPE_CODES so it can never be counted
  // as library drift either.
  const augmented = augmentsLibrary(candidate.code, spec.packageName);
  if (augmented) {
    return {
      taskId: candidate.taskId,
      model: candidate.model,
      passed: false,
      errors: [{ code: "SDKP002", message: augmented, line: 0, column: 0, libraryRelated: false }],
    };
  }

  // Runs BEFORE the empty-candidate check on purpose: augmentation is the more
  // specific diagnosis, and emptyCandidate's `declare` strip is line-oriented in
  // intent but its [^;]* spans newlines, so a multi-line `declare module` block
  // swallows the rest of the candidate and reports SDKP001 instead.
  const empty = emptyCandidate(candidate.code);
  if (empty) {
    return {
      taskId: candidate.taskId,
      model: candidate.model,
      passed: false,
      errors: [{ code: "SDKP001", message: empty, line: 0, column: 0, libraryRelated: false }],
    };
  }

  const candidatePath = path.join(spec.fixtureDir, spec.candidateFile ?? "candidate.ts");
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


/**
 * Detect a candidate that augments the module it is supposed to be USING.
 * Matches the package itself and any subpath entrypoint of it, so
 * `declare module "@apollo/client/react"` is caught as well as
 * `declare module "@apollo/client"`.
 *
 * Deliberately conservative: it fires on ANY augmentation of the library's own
 * module, not only ones that redeclare a removed symbol. Telling those apart
 * needs type introspection, and the cost of being wrong is asymmetric — a
 * false positive costs one task, a false negative silently inflates a
 * published score. Measured before shipping: `declare module` appears in 0 of
 * 35 stored candidate files, so this fires on nothing that has ever been run.
 */
export function augmentsLibrary(code: string, packageName: string): string | null {
  const pkg = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`declare\\s+module\\s+["'\`]${pkg}(?:/[^"'\`]*)?["'\`]`);
  const m = re.exec(code);
  return m
    ? `module augmentation: the candidate redefines "${packageName}" (${m[0].trim()}), which can re-create an API the package removed`
    : null;
}

/**
 * Reject candidates that cannot possibly be an answer. Returns a reason string
 * when the candidate is unusable, or null when it is worth compiling.
 */
export function emptyCandidate(code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed) return "empty candidate: the model returned no code";
  // Strip comments and single-line imports; what remains must contain an export.
  //
  // The character class excludes newlines, which the original did not. `[^;]*`
  // spans lines, so a candidate written WITHOUT SEMICOLONS had its entire body
  // swallowed by the import strip and was reported as an empty candidate —
  // a complete, correct answer recorded as a generation failure. It cost
  // zustand a task on 2026-08-04 (`shallow-equality`, a 78-line answer scored
  // as "no implementation") and every candidate of the first @sanity/client run
  // through the CLI on 2026-08-22, because that model writes semicolon-free TS.
  //
  // A multi-line import is now left in place rather than stripped, which is the
  // safe direction: it only ever makes `body` non-empty, so the candidate goes
  // to the compiler and tsc decides instead of this heuristic.
  const body = trimmed
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*import\s[^;\n]*;?\s*$/gm, "")
    .replace(/^\s*declare\s[^;\n]*;?\s*$/gm, "")
    .trim();
  if (!body) return "empty candidate: only imports and comments, no implementation";
  if (!/\bexport\b/.test(body)) return "no export: the candidate does not implement the requested export";
  return null;
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
export function parseDiagnostics(output: string, spec: VerifyTarget): TscError[] {
  const errors: TscError[] = [];
  for (const line of output.split(/\r?\n/)) {
    const m = DIAG_RE.exec(line);
    if (!m) continue;
    const [, file, lineNo, colNo, code, message] = m;
    // Only diagnostics in the candidate file reflect the model's code.
    if (path.basename(file) !== (spec.candidateFile ?? "candidate.ts")) continue;
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
