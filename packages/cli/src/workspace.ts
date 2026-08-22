import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { requiredPeers, type VersionMeta } from "./registry.ts";

const execFileAsync = promisify(execFile);
const require_ = createRequire(import.meta.url);

export function cacheRoot(): string {
  return (
    process.env.SDKPROOF_CACHE ??
    path.join(process.env.XDG_CACHE_HOME ?? path.join(os.homedir(), ".cache"), "sdkproof")
  );
}

/** The tsc JS entrypoint shipped with this package's own typescript dependency. */
export function resolveTsc(override?: string): string {
  if (override) return path.resolve(override);
  // Resolved through package.json rather than "typescript/bin/tsc": the bin
  // path is not in every typescript release's exports map, but "./package.json"
  // always is.
  const pkgJson = require_.resolve("typescript/package.json");
  return path.join(path.dirname(pkgJson), "bin", "tsc");
}

export interface Workspace {
  /** absolute path holding node_modules, tsconfig.json and (transiently) candidate.ts */
  dir: string;
  packageName: string;
  version: string;
  /** modules that had to be installed on top of the target for it to type-check */
  extraInstalls: string[];
  /** `candidate.tsx` for a React-facing package, `candidate.ts` otherwise */
  candidateFile: string;
  /** true when the workspace was reused from cache rather than installed */
  cached: boolean;
}

export interface WorkspaceOptions {
  packageName: string;
  version: string;
  meta: VersionMeta;
  /** run npm lifecycle scripts; off by default because we only type-check */
  allowScripts?: boolean;
  /** ignore any cached workspace and install fresh */
  fresh?: boolean;
  /** tsc entrypoint to probe with; defaults to this package's own typescript */
  tscEntry?: string;
  log?: (line: string) => void;
}

function slug(name: string, version: string): string {
  return `${name.replace(/[@/]/g, "_")}@${version}`;
}

async function npm(args: string[], cwd: string, allowScripts: boolean): Promise<void> {
  await execFileAsync(
    process.platform === "win32" ? "npm.cmd" : "npm",
    [...args, "--no-audit", "--no-fund", "--loglevel=error", ...(allowScripts ? [] : ["--ignore-scripts"])],
    { cwd, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, npm_config_update_notifier: "false" } },
  );
}

/** `@scope/name` -> `@types/scope__name`, the DefinitelyTyped convention. */
export function typesPackageFor(name: string): string {
  return name.startsWith("@")
    ? `@types/${name.slice(1).replace("/", "__")}`
    : `@types/${name}`;
}

function tsconfigFor(hasReact: boolean): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        // DOM is always on: a browser-facing package fails to resolve its own
        // types without it, and the extra globals cannot turn a wrong API call
        // into a right one — which is the only thing being measured.
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        types: ["node"],
        ...(hasReact ? { jsx: "react-jsx" } : {}),
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
      include: [hasReact ? "candidate.tsx" : "candidate.ts"],
    },
    null,
    2,
  );
}

const PROBE = "sdkproof-probe.ts";
const PROBE_TSCONFIG = "tsconfig.sdkproof-probe.json";

/**
 * Build (or reuse) a throwaway npm project with the target package installed,
 * ready for candidate.ts to be dropped in and type-checked.
 *
 * The interesting part is the self-heal: a package's own types often need peers
 * the package does not depend on, and DefinitelyTyped types for those peers on
 * top. Rather than guess, the probe compiles `import * as m from "<pkg>"` and
 * installs whatever tsc says it cannot find, up to twice. That is what turns
 * "works for the ten libraries on the bench" into "works for a package nobody
 * has scored before".
 */
export async function prepareWorkspace(opts: WorkspaceOptions): Promise<Workspace> {
  const { packageName, version, meta } = opts;
  const log = opts.log ?? (() => {});
  const dir = path.join(cacheRoot(), "workspaces", slug(packageName, version));
  const marker = path.join(dir, ".sdkproof-ready.json");

  if (opts.fresh) await rm(dir, { recursive: true, force: true });
  if (existsSync(marker)) {
    try {
      const prev = JSON.parse(await readFile(marker, "utf8")) as Workspace;
      if (!prev.candidateFile) throw new Error("stale marker");
      log(`Workspace: reusing ${dir}`);
      return { ...prev, dir, cached: true };
    } catch {
      await rm(dir, { recursive: true, force: true });
    }
  }

  await mkdir(dir, { recursive: true });
  await writeFile(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "sdkproof-sandbox", private: true, version: "0.0.0", type: "module" }, null, 2),
  );

  const peers = requiredPeers(meta);
  const first = [`${packageName}@${version}`, "@types/node", ...peers];
  log(`Installing ${first.join(" ")}${opts.allowScripts ? "" : " (lifecycle scripts off)"}`);
  try {
    await npm(["install", ...first], dir, Boolean(opts.allowScripts));
  } catch {
    // A peer that will not co-install is not fatal — the target alone may still
    // type-check, and the probe below will say so.
    log(`  peer install failed, retrying with the target alone`);
    await npm(["install", `${packageName}@${version}`, "@types/node"], dir, Boolean(opts.allowScripts));
  }

  const extraInstalls: string[] = [];
  const hasReact = () => existsSync(path.join(dir, "node_modules", "react", "package.json"));
  await writeFile(path.join(dir, "tsconfig.json"), tsconfigFor(hasReact()));

  // Peers ship untyped surprisingly often; try DefinitelyTyped for each, and
  // treat a miss as normal rather than an error.
  for (const peer of peers) {
    if (await hasTypes(dir, peer)) continue;
    const types = typesPackageFor(peer);
    try {
      await npm(["install", types], dir, Boolean(opts.allowScripts));
      extraInstalls.push(types);
    } catch {
      // no DefinitelyTyped package for this peer; the probe will report it
    }
  }

  const tsc = opts.tscEntry ?? resolveTsc();
  const probeSource = `import * as sdkproofProbe from ${JSON.stringify(packageName)};\nexport default sdkproofProbe;\n`;
  await writeFile(path.join(dir, PROBE), probeSource);
  // A dedicated project file rather than files-on-the-command-line: tsc 7 makes
  // that combination an error (TS5112) when a tsconfig.json is present, and it
  // reports the error INSTEAD of compiling — so the probe silently passed on
  // every package, self-heal included, until this was caught on lodash.
  await writeFile(path.join(dir, PROBE_TSCONFIG), probeTsconfig());
  let probeOutput = "";
  for (let round = 0; round < 3; round++) {
    probeOutput = await runTsc(tsc, path.join(dir, PROBE_TSCONFIG));
    // TS2307: the module is not installed at all. TS7016: it is installed but
    // ships no declarations, so DefinitelyTyped is the only thing that helps —
    // which is exactly what a TypeScript user would reach for. lodash is
    // scorable through @types/lodash and unscorable without it.
    const missing = missingModules(probeOutput);
    const untyped = untypedModules(probeOutput);
    const wanted = [
      ...new Set([...missing.flatMap((m) => [m, typesPackageFor(m)]), ...untyped.map(typesPackageFor)]),
    ].filter((w) => !extraInstalls.includes(w));
    if (!wanted.length) break;
    log(`  probe: installing ${wanted.join(", ")}`);
    for (const w of wanted) {
      try {
        await npm(["install", w], dir, Boolean(opts.allowScripts));
        extraInstalls.push(w);
      } catch {
        // best effort: plenty of packages have no DefinitelyTyped entry
      }
    }
    await writeFile(path.join(dir, "tsconfig.json"), tsconfigFor(hasReact()));
  }
  await rm(path.join(dir, PROBE), { force: true });
  await rm(path.join(dir, PROBE_TSCONFIG), { force: true });

  // Without type declarations there is nothing for tsc to check a candidate
  // against: every answer would compile, and the package would score a perfect
  // 100 for being unmeasurable. Better to stop and say so.
  const untyped = new RegExp(
    `error TS7016: Could not find a declaration file for module '${packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`,
  );
  if (untyped.test(probeOutput)) {
    throw new Error(
      `${packageName}@${version} ships no TypeScript declarations, and ${typesPackageFor(packageName)} ` +
        `is not on npm either. There is nothing for the compiler to check an answer against, ` +
        `so there is nothing to score.`,
    );
  }
  if (missingModules(probeOutput).includes(packageName)) {
    throw new Error(
      `${packageName}@${version} installed but does not resolve — tsc cannot find the module. ` +
        `If it needs a build step, re-run with --allow-scripts.`,
    );
  }

  const ws: Workspace = {
    dir,
    packageName,
    version,
    extraInstalls,
    candidateFile: hasReact() ? "candidate.tsx" : "candidate.ts",
    cached: false,
  };
  await writeFile(marker, JSON.stringify(ws, null, 2));
  return ws;
}

async function hasTypes(dir: string, name: string): Promise<boolean> {
  const base = path.join(dir, "node_modules", ...name.split("/"));
  try {
    const pkg = JSON.parse(await readFile(path.join(base, "package.json"), "utf8"));
    if (pkg.types || pkg.typings) return true;
  } catch {
    return false;
  }
  return existsSync(path.join(base, "index.d.ts"));
}

/**
 * The module names tsc could not resolve. Only TS2307 counts: any other
 * diagnostic is the package's own business, not a missing install.
 */
function missingModules(out: string): string[] {
  return moduleNamesFrom(out, /error TS2307: Cannot find module '([^']+)'/);
}

/** Modules that resolved but ship no declarations — DefinitelyTyped candidates. */
function untypedModules(out: string): string[] {
  return moduleNamesFrom(out, /error TS7016: Could not find a declaration file for module '([^']+)'/);
}

function moduleNamesFrom(out: string, re: RegExp): string[] {
  const found = new Set<string>();
  for (const line of out.split(/\r?\n/)) {
    const m = re.exec(line);
    if (!m) continue;
    const name = m[1];
    if (name.startsWith(".") || name.startsWith("/")) continue;
    // Subpath imports resolve from the package root, so install the root.
    const parts = name.split("/");
    found.add(name.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]);
  }
  return [...found];
}

/**
 * The probe project. `strict` matters: TS7016 ("could not find a declaration
 * file for module X") only fires under noImplicitAny, and that diagnostic is
 * the whole untyped-package check. Without it, lodash sails through as scorable
 * and would then score 100 for being unmeasurable.
 */
function probeTsconfig(): string {
  return JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        esModuleInterop: true,
      },
      include: [PROBE],
    },
    null,
    2,
  );
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
