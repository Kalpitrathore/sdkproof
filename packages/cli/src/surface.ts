import path from "node:path";
import { extractTarball, fetchTarball } from "./tarball.ts";
import { fetchPackument, resolveVersion, type Packument, type VersionMeta } from "./registry.ts";

/**
 * The exported symbol surface of a published package, read out of its tarball.
 *
 * This is a port of the research sweep that ran over 7,453 packages, kept
 * because two of its behaviours were learned the hard way and are not obvious:
 *
 *  - the widen decision (entry file only, vs every .d.ts in the package) must
 *    be made ONCE for a pair of versions being compared. Deciding it per version
 *    made Apollo look like it had removed 560 symbols — 674 -> 133 — purely
 *    because v3's entry file triggered the widen and v4's did not.
 *  - a symbol that carried an `@deprecated` jsdoc in the OLD major produces no
 *    drift worth reporting. Deprecate-then-remove is the process working; the
 *    findings live in removals that shipped with no runway.
 */

export interface Surface {
  /**
   * The package's real public surface: symbols reachable from the declared type
   * entrypoint, following `export * from "./x"` re-export chains through the
   * files in the tarball.
   *
   * A barrel entrypoint that is nothing but `export * from "./core"` extracts to
   * ZERO symbols if you only read the entry file — which is what @apollo/client
   * v3 does. Resolving the chain is the difference between "0 exports" and the
   * 133 a user can actually import.
   */
  entryOnly: Set<string>;
  /** symbols exported by ANY .d.ts in the package */
  widened: Set<string>;
  /** true when the entry alone undercounts — `export *`, or a near-empty entry */
  needsWiden: boolean;
  /** every .d.ts source in the package, for the @deprecated lookup */
  sources: string[];
  /** the type entrypoint that was found, relative to the package root */
  entry: string;
  /** `export *` specifiers the walk could not follow inside the tarball */
  unresolved: string[];
  /** the README that shipped in this version's tarball, "" if it ships none */
  readme: string;
  /**
   * Where the declarations came from: the package itself, or the
   * DefinitelyTyped package that publishes them on its behalf.
   *
   * express, react, lodash and plenty of others ship no types at all — the
   * types are a separate npm package with its own versions. Reading only the
   * package's own tarball reports every one of them as unscorable, which is
   * true of the tarball and useless to the reader.
   */
  typesFrom: string;
}

/**
 * The root entry of an `exports` field, whichever of its two shapes is used:
 * the subpath map keyed by "." , or the sugar form where the object itself is
 * the condition map.
 */
export function subpathRoot(exports: unknown): unknown {
  if (!exports || typeof exports !== "object") return undefined;
  const keys = Object.keys(exports as object);
  if (keys.some((k) => k === "." || k.startsWith("./"))) return (exports as Record<string, unknown>)["."];
  return exports;
}

/** Where a package's type entrypoint might be declared, in order of authority. */
function typeCandidates(pkg: Record<string, any>): string[] {
  const out: string[] = [];
  const push = (p: unknown) => {
    if (typeof p === "string") out.push(p.replace(/^\.\//, ""));
  };
  push(pkg.types);
  push(pkg.typings);
  // `exports` has two shapes and both are common. The subpath map keys every
  // entry by path (`{".": {...}, "./x": {...}}`), and the sugar form drops the
  // "." and IS the condition map (`{"types": "...", "default": "..."}`). Reading
  // only `exports["."]` misses the sugar entirely — which is how chalk 6, a
  // package that ships a perfectly good index.d.ts, read as untyped.
  const dot = subpathRoot(pkg.exports);
  if (dot && typeof dot === "object") {
    const cond = dot as Record<string, any>;
    push(cond.types);
    for (const k of ["import", "require", "default", "node"]) {
      const v = cond[k];
      if (typeof v === "string" && v.endsWith(".d.ts")) push(v);
      else if (v && typeof v === "object") push(v.types ?? v.default);
    }
  }
  // No `types`, no `typings`, no `exports` — the declarations sit beside the
  // JS entry under TypeScript's oldest convention, `main.js` -> `main.d.ts`.
  // `stripe` still ships this way, and without it the whole package reads as
  // untyped.
  for (const field of ["main", "module", "browser"]) {
    const v = pkg[field];
    if (typeof v !== "string") continue;
    const stem = v.replace(/^\.\//, "").replace(/\.(js|cjs|mjs)$/, "");
    out.push(`${stem}.d.ts`, `${stem}.d.cts`, `${stem}.d.mts`);
  }
  // Some packages only ship .d.mts/.d.cts, or bury the entry a level deeper.
  const deep = (o: unknown, d = 0): void => {
    if (d > 3 || !o) return;
    if (typeof o === "string") return push(o);
    if (typeof o === "object") for (const v of Object.values(o as object)) deep(v, d + 1);
  };
  deep(dot);
  out.push(
    "index.d.ts", "dist/index.d.ts", "types/index.d.ts", "lib/index.d.ts",
    "dist/types/index.d.ts", "dist/development/index.d.ts", "dist/production/index.d.ts",
    "dist/node/index.d.ts", "dist/index.d.mts", "dist/index.d.cts", "index.d.mts",
    "types/index.d.mts", "dist/esm/index.d.ts", "build/index.d.ts",
  );
  return [...new Set(out.filter((p) => p && /\.d\.[cm]?ts$/.test(p)))];
}

export function symbolsFromSource(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/export\s*(?:type\s*)?\{([^}]*)\}/gs)) {
    for (let part of m[1].split(",")) {
      part = part.trim().replace(/^type\s+/, "");
      if (!part) continue;
      const n = part.split(/\s+as\s+/).pop()!.trim();
      if (/^[A-Za-z_$][\w$]*$/.test(n)) out.add(n);
    }
  }
  for (const m of src.matchAll(
    /^export\s+declare\s+(?:abstract\s+)?(?:function|const|let|var|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/gm,
  )) out.add(m[1]);
  for (const m of src.matchAll(
    /^export\s+(?:interface|type|enum|abstract class|class|function|const)\s+([A-Za-z_$][\w$]*)/gm,
  )) out.add(m[1]);
  return out;
}

/**
 * The members of an ambient declaration — `declare module "x" { ... }` or
 * `declare namespace X { ... }` paired with `export = X`.
 *
 * This is how a large share of the ecosystem still declares itself: every
 * DefinitelyTyped package for a CommonJS library, plus stripe, winston, pino,
 * mongoose and knex among the packages measured. An ES-export reader finds
 * nothing in them, so without this the tool answers "cannot read this package"
 * for one popular package in four.
 *
 * Only the top level of the block counts. Nested namespaces are the library's
 * internal organisation, and counting them makes a rename inside one look like
 * a removal from the public surface.
 */
export function ambientSymbols(src: string): Set<string> {
  const out = new Set<string>();
  const OPEN = /declare\s+(?:module\s+["'`][^"'`]+["'`]|namespace\s+[A-Za-z_$][\w$.]*)\s*\{/g;
  const DECL =
    /^\s*(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:interface|type|class|function|const|let|var|enum|namespace)\s+([A-Za-z_$][\w$]*)/;

  for (const open of src.matchAll(OPEN)) {
    // Brace-match the block so a nested `{` cannot end it early.
    let depth = 1;
    let i = open.index! + open[0].length;
    const start = i;
    for (; i < src.length && depth > 0; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
    }
    const body = src.slice(start, i - 1);

    for (const name of topLevelDecls(body)) out.add(name);
  }

  // `declare module "stripe" { namespace Stripe { ... } }` puts the entire API
  // one level further in. A block whose only member is a namespace is a
  // container, so read what it contains instead of reporting one symbol.
  if (out.size === 1) {
    const only = [...out][0];
    const inner = new RegExp(`namespace\\s+${only}\\b[^{]*\\{`).exec(src);
    if (inner) {
      let depth = 1;
      let i = inner.index + inner[0].length;
      const start = i;
      for (; i < src.length && depth > 0; i++) {
        if (src[i] === "{") depth++;
        else if (src[i] === "}") depth--;
      }
      for (const name of topLevelDecls(src.slice(start, i - 1))) out.add(name);
    }
  }
  return out;
}

/** Declarations at the top level of a block body, ignoring anything nested. */
function topLevelDecls(body: string): string[] {
  const DECL =
    /^\s*(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:interface|type|class|function|const|let|var|enum|namespace)\s+([A-Za-z_$][\w$]*)/;
  const names: string[] = [];
  let d = 0;
  for (const line of body.split("\n")) {
    if (d === 0) {
      const m = DECL.exec(line);
      if (m) names.push(m[1]);
    }
    for (const ch of line) {
      if (ch === "{") d++;
      else if (ch === "}") d--;
    }
    if (d < 0) d = 0;
  }
  return names;
}

/** Did `sym` carry an @deprecated jsdoc in this package? */
export function isDeprecated(sources: string[], sym: string): boolean {
  const decl = new RegExp(
    `(?:interface|type|declare\\s+(?:const|function|class|abstract\\s+class|enum)|class|function|const|enum)\\s+${sym}\\b`,
  );
  for (const src of sources) {
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!decl.test(lines[i])) continue;
      const win = lines.slice(Math.max(0, i - 25), i).join("\n");
      // only the jsdoc block immediately attached to this declaration counts
      const lastClose = win.lastIndexOf("*/");
      const seg = lastClose === -1 ? win : win.slice(win.lastIndexOf("/**", lastClose), lastClose);
      if (/@deprecated/.test(seg)) return true;
    }
  }
  return false;
}

/**
 * The published tarball's package.json, README and .d.ts files.
 *
 * Cached per package@version for the life of the process: a scored run needs
 * the README and the drift diff needs the declarations, and downloading the
 * same tarball twice for that is pure latency.
 */
const tarballCache = new Map<string, Map<string, string>>();

export async function packageFiles(p: Packument, version: string): Promise<Map<string, string>> {
  const key = `${p.name}@${version}`;
  const hit = tarballCache.get(key);
  if (hit) return hit;
  const meta: VersionMeta | undefined = p.versions[version];
  const url = meta?.dist?.tarball;
  if (!url) throw new Error(`${key} has no tarball on the registry`);
  const files = extractTarball(
    await fetchTarball(url),
    (rel) => rel === "package.json" || /\.d\.[cm]?ts$/.test(rel) || /^readme(\.[a-z]+)?$/i.test(rel),
  );
  tarballCache.set(key, files);
  return files;
}

/**
 * The README as it shipped in THAT version's tarball.
 *
 * The registry only carries a README on the packument for the latest release,
 * so scoring or diffing an older version against the top-level `readme` field
 * describes the wrong API. Reading it out of the tarball is the only way to get
 * the document that shipped with the code being measured.
 */
export async function readmeOf(p: Packument, version: string): Promise<string> {
  const files = await packageFiles(p, version);
  for (const [rel, src] of files) if (/^readme(\.[a-z]+)?$/i.test(rel)) return src;
  return "";
}

/**
 * Fetch one published version and read its exported surface.
 *
 * `followDeps` lets the walk cross a package boundary once. Plenty of packages
 * are a thin wrapper over a core they depend on — `@tanstack/react-table` is
 * `export * from "@tanstack/table-core"` plus two hooks — and without this its
 * surface reads as 3 symbols instead of several hundred. The counts on both
 * sides of a diff are wrong together, so the removals stay right, but "3
 * exported symbols -> 61" is not a sentence anyone should have to interpret.
 */
export async function surfaceOf(p: Packument, version: string, followDeps = true): Promise<Surface> {
  try {
    return await readSurface(p, version, followDeps, p.name);
  } catch (err) {
    if (!(err instanceof NoTypeEntrypoint)) throw err;
    // The package publishes no declarations of its own. DefinitelyTyped is
    // where they live for that whole family of packages, and it is what a
    // TypeScript user installs, so it is the surface worth diffing.
    const types = await typesPackageFor(p.name, version).catch(() => null);
    if (!types) throw untyped(p.name, version);
    try {
      const s = await readSurface(types.packument, types.version, followDeps, types.packument.name);
      return { ...s, typesFrom: `${types.packument.name}@${types.version}` };
    } catch {
      // A @types stub that carries nothing is not an answer either. Report the
      // package the caller actually asked about.
      throw untyped(p.name, version);
    }
  }
}

/** Thrown when a tarball carries no declarations we can point at. */
class NoTypeEntrypoint extends Error {}

function untyped(name: string, version: string): Error {
  return new Error(
    `${name}@${version} ships no TypeScript declarations, and neither does its @types package. ` +
      `There is nothing for tsc to check an answer against.`,
  );
}

/**
 * The DefinitelyTyped package for `name`, at the version whose major matches
 * the package's. `@types/*` tracks the package's major by convention
 * (@types/express 4.x for express 4.x), so that is the pairing to use; if the
 * major is not published there, the latest is closer than nothing.
 */
async function typesPackageFor(
  name: string,
  version: string,
): Promise<{ packument: Packument; version: string } | null> {
  const typesName = name.startsWith("@")
    ? `@types/${name.slice(1).replace("/", "__")}`
    : `@types/${name}`;
  const packument = await fetchPackument(typesName);
  const major = version.split(".")[0];
  try {
    return { packument, version: resolveVersion(packument, major) };
  } catch {
    return { packument, version: resolveVersion(packument) };
  }
}

async function readSurface(
  p: Packument,
  version: string,
  followDeps: boolean,
  label: string,
): Promise<Surface> {
  const files = await packageFiles(p, version);

  let pkg: Record<string, any> = {};
  try {
    pkg = JSON.parse(files.get("package.json") ?? "{}");
  } catch {
    // a package.json we cannot parse just means we fall back to the guessed entries
  }

  const dts = [...files.entries()].filter(([rel]) => /\.d\.[cm]?ts$/.test(rel));
  const sources = dts.map(([, src]) => src);

  let entry = "";
  let entrySrc = "";
  for (const c of typeCandidates(pkg)) {
    const src = files.get(c);
    if (src !== undefined) {
      entry = c;
      entrySrc = src;
      break;
    }
  }
  if (!entry) throw new NoTypeEntrypoint(`${p.name}@${version} ships no type entrypoint`);

  const { symbols: entryOnly, unresolved } = resolveExports(files, entry);
  const widened = new Set(entryOnly);
  for (const s of sources) {
    for (const x of symbolsFromSource(s)) widened.add(x);
    for (const x of ambientSymbols(s)) widened.add(x);
  }

  // An ambient declaration exports nothing in the ES sense, so the reader above
  // comes back empty on a package that is entirely `declare module`. Read the
  // block itself before giving up.
  if (entryOnly.size < 5) {
    for (const x of ambientSymbols(entrySrc)) entryOnly.add(x);
    if (entryOnly.size < 5) for (const src of sources) for (const x of ambientSymbols(src)) entryOnly.add(x);
  }

  // Cross the package boundary once, for an `export *` that points at a
  // dependency this package declares. Anything else stays unresolved.
  const stillUnresolved: string[] = [];
  if (followDeps) {
    for (const spec of unresolved) {
      const inherited = await surfaceOfDependency(pkg, spec).catch(() => null);
      if (!inherited) {
        stillUnresolved.push(spec);
        continue;
      }
      for (const x of inherited.entryOnly) {
        entryOnly.add(x);
        widened.add(x);
      }
      for (const x of inherited.widened) widened.add(x);
      sources.push(...inherited.sources);
    }
  } else {
    stillUnresolved.push(...unresolved);
  }
  // Only widen when the resolved surface is still not believable: an `export *`
  // we could not follow at all, or an entry that yields almost nothing.
  const needsWiden = entryOnly.size < 5 || stillUnresolved.length > 0;
  let readme = "";
  for (const [rel, src] of files) {
    if (/^readme(\.[a-z]+)?$/i.test(rel)) {
      readme = src;
      break;
    }
  }
  return {
    entryOnly, widened, needsWiden, sources, entry,
    unresolved: stillUnresolved, readme, typesFrom: label,
  };
}

/**
 * Read the surface of a package this one depends on, at the version the
 * dependency range names. No semver library: an exact pin is used as-is, a
 * caret or tilde range falls back to the highest stable release of that major,
 * and anything else (`workspace:*`, a git url) is left unresolved.
 */
async function surfaceOfDependency(pkg: Record<string, any>, spec: string): Promise<Surface | null> {
  const range: string | undefined =
    pkg.dependencies?.[spec] ?? pkg.peerDependencies?.[spec] ?? pkg.optionalDependencies?.[spec];
  if (!range) return null;
  const bare = String(range).replace(/^[\^~>=<\sv]+/, "");
  if (!/^\d/.test(bare)) return null;
  const dep = await fetchPackument(spec);
  const version = dep.versions[bare] ? bare : resolveVersion(dep, bare.split(".")[0]);
  // followDeps=false: one hop only, so a deep dependency chain cannot turn one
  // drift check into a package-tree crawl.
  return surfaceOf(dep, version, false);
}

/** `export * from "spec"` / `export { a } from "spec"` — the specifier only. */
const REEXPORT_ALL = /export\s+\*\s+from\s*["'`]([^"'`]+)["'`]/g;

/**
 * Walk the re-export chain from an entry .d.ts and collect every symbol a
 * consumer can import from the package root.
 *
 * `export { a } from "./b"` needs no walking — symbolsFromSource already sees
 * the names. Only `export * from "./b"` hides them, so only those are followed.
 * A bare (non-relative) `export *` cannot be resolved inside one tarball; it is
 * reported so the caller can fall back to scanning every .d.ts instead of
 * silently under-reporting the surface.
 */
export function resolveExports(
  files: Map<string, string>,
  entry: string,
  maxDepth = 12,
): { symbols: Set<string>; unresolved: string[] } {
  const symbols = new Set<string>();
  const unresolved: string[] = [];
  const seen = new Set<string>();

  const walk = (rel: string, depth: number): void => {
    if (depth > maxDepth || seen.has(rel)) return;
    seen.add(rel);
    const src = files.get(rel);
    if (src === undefined) return;
    for (const x of symbolsFromSource(src)) symbols.add(x);
    for (const m of src.matchAll(REEXPORT_ALL)) {
      const spec = m[1];
      if (!spec.startsWith(".")) {
        unresolved.push(spec);
        continue;
      }
      const target = resolveRelativeDts(files, path.posix.dirname(rel), spec);
      if (target) walk(target, depth + 1);
      else unresolved.push(spec);
    }
  };

  walk(entry, 0);
  return { symbols, unresolved: [...new Set(unresolved)] };
}

/** Map a relative specifier onto a .d.ts path inside the tarball. */
function resolveRelativeDts(files: Map<string, string>, dir: string, spec: string): string | null {
  const base = path.posix.normalize(path.posix.join(dir, spec)).replace(/^\.\//, "");
  // `export * from "./core.js"` is how an ESM-correct .d.ts names its sibling.
  const stem = base.replace(/\.(js|mjs|cjs|d\.ts|d\.mts|d\.cts)$/, "");
  for (const c of [
    base,
    `${stem}.d.ts`, `${stem}.d.mts`, `${stem}.d.cts`,
    `${stem}/index.d.ts`, `${stem}/index.d.mts`, `${stem}/index.d.cts`,
  ]) {
    if (files.has(c)) return c;
  }
  return null;
}

/**
 * Was `sym` a VALUE in this package — a function, class, const or enum — rather
 * than a type-only declaration?
 *
 * It matters for ranking. A model writes values far more often than it writes
 * type names, so `useReactTable` disappearing is a finding and
 * `ColumnFiltersInstance` disappearing usually is not. Declaration merging is
 * resolved in favour of the value, which is the side a model would have
 * written.
 */
export function isValueExport(sources: string[], sym: string): boolean {
  const escaped = sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = new RegExp(
    `\\b(?:declare\\s+)?(?:abstract\\s+)?(?:function|class|const|let|var|enum)\\s+${escaped}\\b`,
  );
  return sources.some((src) => value.test(src));
}

/**
 * Names nobody writes on purpose, so their removal is not a finding. A leading
 * underscore is the convention for "internal, do not import"; `_getVisibleLeafColumns`
 * leaving @tanstack/react-table is not something a model was ever going to write.
 */
export function isPublicName(s: string): boolean {
  return !s.startsWith("UNSAFE_") && !s.startsWith("unstable_") && !s.startsWith("_");
}
