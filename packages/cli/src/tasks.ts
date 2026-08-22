import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ModelAdapter } from "./core/model.ts";
import type { Difficulty, Task } from "./core/types.ts";
import { cacheRoot } from "./workspace.ts";

/**
 * Where the tasks come from when nobody hand-wrote them.
 *
 * The bench's ten libraries have hand-authored task sets. For a package nobody
 * has scored before, a model writes them from the package's own README at the
 * version being scored — which is the only description of the library that is
 * guaranteed current for that version.
 *
 * Two rules make the result a measurement rather than a quiz the model sets
 * itself, and both are enforced below rather than merely requested:
 *
 *  1. a skeleton may not import from the package under test. If the skeleton
 *     hands over the import line, the hardest half of the drift — which symbol
 *     to reach for, and from which entrypoint — is answered before the model
 *     starts. TanStack Table v9's whole finding is that the model still writes
 *     `useReactTable`; a skeleton containing `import { useTable }` erases it.
 *  2. neither the prompt nor the skeleton may name an export of the package.
 *     The task says what to build; remembering the API is the thing being
 *     measured.
 */

const SYNTHESIS_SYSTEM =
  "You write evaluation tasks for a TypeScript benchmark. " +
  "You respond with ONLY a single JSON array inside one ```json code block — no prose before or after.";

export interface SynthesisInput {
  packageName: string;
  version: string;
  description: string;
  readme: string;
  count: number;
}

export interface TaskSet {
  packageName: string;
  version: string;
  /** the one-line steer handed to the model under test, alongside each task */
  docsHint: string;
  tasks: Task[];
  /** tasks the model wrote that had to be dropped, and why */
  rejected: { id: string; reason: string }[];
  /** "synthesized" or the path a --tasks file came from */
  source: string;
}

function buildSynthesisPrompt(input: SynthesisInput): string {
  return [
    `Package: ${input.packageName}@${input.version}`,
    input.description ? `Description: ${input.description}` : "",
    "",
    "README (may be truncated):",
    "---",
    input.readme.slice(0, 18_000),
    "---",
    "",
    `Write exactly ${input.count} small, realistic coding tasks that a working developer would use this library for.`,
    "Spread them across the library's main feature areas and across difficulty: roughly a third easy, a third medium, a third hard.",
    "",
    "Each task is an object with these fields:",
    '  "id"        kebab-case, unique, 2-4 words, describes the job',
    '  "area"      one lowercase word for the feature area, e.g. "queries", "auth", "streaming"',
    '  "difficulty" one of "easy", "medium", "hard"',
    '  "prompt"    one or two sentences telling the developer what to build, and what to export',
    '  "skeleton"  the TypeScript file to complete',
    "",
    "HARD RULES — a task breaking any of these is thrown away:",
    `  - The skeleton MUST NOT import from "${input.packageName}" or any of its subpaths. The solver writes its own imports.`,
    `  - Neither the prompt nor the skeleton may name any export, function, class, hook, option or method of ${input.packageName}. Describe the capability instead: say "the library's typed column-definition helper", never the helper's name.`,
    "  - The skeleton may declare local types, local constants and the comment describing what to write. It may import from node builtins or from other libraries, but not from the package under test.",
    "  - The prompt must name the exported symbol the solution has to provide, and that name must be the solver's own, not the library's.",
    "  - Every task must be solvable in one file of under 40 lines, and must actually require the library — not something plain TypeScript could do.",
    "",
    `The array has ${input.count + 1} elements: one docsHint object first, then the ${input.count} tasks. The docsHint is EXTRA — it does not count as one of the ${input.count}.`,
    "",
    "The first element is an object of the form",
    '  { "docsHint": "..." }',
    `where docsHint is two or three sentences describing what ${input.packageName} is and the domain the tasks operate over (the data model, the resources, the shape of the problem).`,
    "The docsHint MUST NOT name any export, method or option of the library either.",
    "",
    "Respond with one ```json block containing the array.",
  ]
    .filter(Boolean)
    .join("\n");
}

function extractJson(text: string): unknown {
  const fenced = [...text.matchAll(/```(?:json)?[^\S\r\n]*\r?\n([\s\S]*?)```/g)].map((m) => m[1].trim());
  const candidates = fenced.length ? fenced : [text.trim()];
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      // try the next block; a model sometimes emits an explanation block first
    }
  }
  // last resort: the outermost array in the text
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // fall through to the throw below
    }
  }
  throw new Error("task synthesis did not return parseable JSON");
}

const DIFFICULTIES = new Set<Difficulty>(["easy", "medium", "hard"]);

/** Does this source import from the package under test, or any subpath of it? */
export function importsPackage(code: string, packageName: string): boolean {
  const pkg = packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const spec = `["'\`]${pkg}(?:/[^"'\`]*)?["'\`]`;
  return (
    new RegExp(`\\bfrom\\s+${spec}`).test(code) ||
    new RegExp(`\\bimport\\s*\\(\\s*${spec}`).test(code) ||
    new RegExp(`\\bimport\\s+${spec}`).test(code) ||
    new RegExp(`\\brequire\\s*\\(\\s*${spec}`).test(code)
  );
}

export function validateTasks(
  raw: unknown,
  packageName: string,
): { docsHint: string; tasks: Task[]; rejected: { id: string; reason: string }[] } {
  if (!Array.isArray(raw)) throw new Error("task synthesis returned something that is not an array");
  let docsHint = "";
  const tasks: Task[] = [];
  const rejected: { id: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    if (typeof o.docsHint === "string" && !o.prompt) {
      docsHint = o.docsHint.trim();
      continue;
    }
    const id = String(o.id ?? "").trim();
    const prompt = String(o.prompt ?? "").trim();
    const skeleton = String(o.skeleton ?? "");
    const reject = (reason: string) => rejected.push({ id: id || "(unnamed)", reason });

    if (!id || !prompt) {
      reject("missing id or prompt");
      continue;
    }
    if (seen.has(id)) {
      reject("duplicate id");
      continue;
    }
    // Rule 1, enforced rather than trusted: a skeleton that imports the package
    // hands over the answer to the half of the problem that carries the drift.
    if (importsPackage(skeleton, packageName) || importsPackage(prompt, packageName)) {
      reject(`names "${packageName}" in an import — that gives away the entrypoint`);
      continue;
    }
    if (!/export/i.test(`${prompt}\n${skeleton}`)) {
      reject("does not ask for an export, so a passing answer cannot be told from an empty file");
      continue;
    }
    const difficulty = DIFFICULTIES.has(o.difficulty as Difficulty)
      ? (o.difficulty as Difficulty)
      : "medium";
    seen.add(id);
    tasks.push({
      id,
      area: String(o.area ?? "general").trim().toLowerCase() || "general",
      difficulty,
      prompt,
      skeleton,
    });
  }
  return { docsHint, tasks, rejected };
}

function taskCachePath(packageName: string, version: string): string {
  return path.join(cacheRoot(), "tasks", `${packageName.replace(/[@/]/g, "_")}@${version}.json`);
}

export async function loadTaskFile(file: string, packageName: string): Promise<TaskSet> {
  const parsed = JSON.parse(await readFile(file, "utf8"));
  // Accept both a bare Task[] (the bench's data/*.tasks.json shape) and a
  // full TaskSet written by an earlier run.
  if (Array.isArray(parsed)) {
    const { docsHint, tasks, rejected } = validateTasks(parsed, packageName);
    return { packageName, version: "", docsHint, tasks, rejected, source: file };
  }
  return { ...(parsed as TaskSet), source: file };
}

export interface SynthesizeOptions extends SynthesisInput {
  model: ModelAdapter;
  /** reuse a cached task set for this exact package@version */
  cache?: boolean;
  log?: (line: string) => void;
}

export async function synthesizeTasks(opts: SynthesizeOptions): Promise<TaskSet> {
  const log = opts.log ?? (() => {});
  const cacheFile = taskCachePath(opts.packageName, opts.version);
  if (opts.cache !== false) {
    try {
      const cached = JSON.parse(await readFile(cacheFile, "utf8")) as TaskSet;
      if (cached.tasks?.length) {
        log(`Tasks: reusing ${cached.tasks.length} cached task(s) — ${cacheFile}`);
        return { ...cached, source: cacheFile };
      }
    } catch {
      // no cache yet
    }
  }

  log(`Tasks: writing ${opts.count} from the ${opts.packageName}@${opts.version} README`);
  const raw = await opts.model.generate({
    system: SYNTHESIS_SYSTEM,
    user: buildSynthesisPrompt(opts),
    maxTokens: 16000,
  });
  const { docsHint, tasks, rejected } = validateTasks(extractJson(raw), opts.packageName);
  if (!tasks.length) throw new Error("task synthesis produced no usable tasks");

  const set: TaskSet = {
    packageName: opts.packageName,
    version: opts.version,
    docsHint: docsHint || opts.description,
    tasks,
    rejected,
    source: "synthesized",
  };
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(set, null, 2));
  return set;
}
