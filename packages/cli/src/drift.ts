import { compareVersions, majorLines, monthsSince, readmeFor, type Packument } from "./registry.ts";
import { isDeprecated, isPublicName, isValueExport, surfaceOf, type Surface } from "./surface.ts";

/**
 * What changed between two published versions of a package, computed from the
 * .d.ts files alone — no model, no API key, no install.
 *
 * This answers the question that decides whether a scored run is worth paying
 * for: has this package removed anything a model is likely to still be writing?
 */
export interface DriftReport {
  package: string;
  from: { version: string; major: number; published: string };
  to: { version: string; major: number; published: string };
  /** months since the FIRST release in the `to` version's major line */
  majorAgeMonths: number;
  /** which extraction mode was used for BOTH versions — never mixed */
  mode: "entry-only" | "all-dts";
  fromCount: number;
  toCount: number;
  /** exported symbols present in `from` and gone in `to`, under `mode` */
  removed: string[];
  /**
   * The subset of `removed` that carried no `@deprecated` jsdoc in the old
   * version. Deprecate-then-remove gives a model's training data a signal to
   * pick up; a silent removal does not, which is where the drift lives.
   */
  withoutRunway: string[];
  /**
   * The same thing computed from the package's declared type ENTRYPOINT only —
   * what `import { x } from "pkg"` can actually reach. This is the sharp list.
   * `removed` widens to every .d.ts in the package when either version's entry
   * re-exports with `export *`, which drags in internals nobody imports.
   */
  removedFromEntry: string[];
  /**
   * The subset of `removedFromEntry` that the OLD version's README actually
   * documents. A removed export nobody wrote produces no drift; a removed
   * export the library taught people to write produces all of it. This is the
   * list to lead with, and the reason `zod` looks alarming on raw counts —
   * 155 exports went, but most were internal type aliases nobody imported.
   */
  documentedRemovals: string[];
  /**
   * The subset of `removedFromEntry` that was a value — a function, hook,
   * class, const or enum — rather than a type-only declaration. A model writes
   * values far more often than type names, so this is the sharper list when the
   * package ships a README too thin to rank against.
   */
  valueRemovals: string[];
  /**
   * False when the .d.ts files could not be read into a believable surface —
   * almost always because the package declares itself with an ambient
   * `declare module "pkg" { ... }` instead of ES exports. `stripe` does, and
   * reading it naively gives "2 exported symbols -> 1131" and a confident
   * "nothing was removed", which is worse than no answer.
   */
  readable: boolean;
  unreadableReason?: string;
  /**
   * Where the declarations were read from, when that is not the package itself
   * — `@types/express@4.17.23` and the like. Worth saying out loud: the diff is
   * then of what DefinitelyTyped publishes, which can lag the package.
   */
  typesFrom?: string;
}

export interface DriftOptions {
  /** explicit lower version; defaults to the top of the previous major line */
  from?: string;
  /** explicit upper version; defaults to the top of the newest major line */
  to?: string;
}

export async function computeDrift(p: Packument, opts: DriftOptions = {}): Promise<DriftReport> {
  const lines = majorLines(p);
  if ((!opts.from || !opts.to) && lines.length < 2) {
    throw new Error(
      `${p.name} has only one major line — there is nothing to diff. Pass --from and --to to compare two specific versions.`,
    );
  }
  const fromVersion = opts.from ?? lines[lines.length - 2].latest;
  const toVersion = opts.to ?? lines[lines.length - 1].latest;
  if (compareVersions(fromVersion, toVersion) >= 0) {
    throw new Error(`--from (${fromVersion}) must be older than --to (${toVersion})`);
  }

  const [a, b] = await Promise.all([surfaceOf(p, fromVersion), surfaceOf(p, toVersion)]);
  const diff = diffSurfaces(a, b, a.readme || readmeFor(p, fromVersion));

  const toMajor = Number(toVersion.split(".")[0]);
  const toLine = lines.find((l) => l.major === toMajor);
  return {
    package: p.name,
    from: { version: fromVersion, major: Number(fromVersion.split(".")[0]), published: p.time?.[fromVersion] ?? "" },
    to: { version: toVersion, major: toMajor, published: p.time?.[toVersion] ?? "" },
    majorAgeMonths: Number(monthsSince(toLine?.first ?? p.time?.[toVersion] ?? "").toFixed(1)),
    ...diff,
  };
}

/** What one surface lost relative to another. Split out so it can be tested without the network. */
export function diffSurfaces(
  a: Surface,
  b: Surface,
  oldReadme: string,
): Pick<
  DriftReport,
  | "mode" | "fromCount" | "toCount" | "removed" | "withoutRunway"
  | "removedFromEntry" | "documentedRemovals" | "valueRemovals" | "readable"
  | "unreadableReason" | "typesFrom"
> {
  // ONE mode for the pair. Deciding per version is what made Apollo read as a
  // 674 -> 133 collapse when the real removal count was far smaller.
  const widen = a.needsWiden || b.needsWiden;
  const fromSyms = widen ? a.widened : a.entryOnly;
  const toSyms = widen ? b.widened : b.entryOnly;

  const removed = [...fromSyms].filter((s) => !toSyms.has(s) && isPublicName(s)).sort();
  const withoutRunway = removed.filter((s) => !isDeprecated(a.sources, s));
  const removedFromEntry = [...a.entryOnly]
    .filter((s) => !b.entryOnly.has(s) && isPublicName(s) && !isDeprecated(a.sources, s))
    .sort();

  // Word-boundary hits in the old README, so `parse` does not match `safeParse`.
  const documentedRemovals = removedFromEntry.filter((sym) =>
    new RegExp(`\\b${sym.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(oldReadme),
  );

  const valueRemovals = removedFromEntry.filter((sym) => isValueExport(a.sources, sym));

  // A package with fewer than five readable exports either has almost no API or
  // is not declaring it in a form this reader understands. Either way a diff
  // against it is not evidence.
  // Both sides must come from the same place. A package that started shipping
  // its own declarations mid-diff would otherwise read as a total rewrite of
  // its API, when all that changed is who publishes the types.
  const movedHome = a.typesFrom !== b.typesFrom && !sameOwner(a.typesFrom, b.typesFrom);
  const thin = Math.min(fromSyms.size, toSyms.size) < 5;
  const ambient = /declare\s+module\s+["'`]/.test(a.sources.join("\n").slice(0, 200_000));
  const readable = !thin && !movedHome;
  const unreadableReason = readable
    ? undefined
    : movedHome
      ? `the two versions publish their declarations in different places (${a.typesFrom} and ${b.typesFrom}), so a diff would compare two different documents`
      : ambient
        ? "its declarations are an ambient `declare module` block rather than ES exports, which this diff cannot read"
        : "too few exported symbols were readable from its .d.ts files to make a diff meaningful";

  return {
    readable,
    ...(unreadableReason ? { unreadableReason } : {}),
    ...(a.typesFrom.startsWith("@types/") ? { typesFrom: a.typesFrom } : {}),
    mode: widen ? "all-dts" : "entry-only",
    fromCount: fromSyms.size,
    toCount: toSyms.size,
    removed,
    withoutRunway,
    removedFromEntry,
    documentedRemovals,
    valueRemovals,
  };
}

/** `@types/express@4.17.23` and `@types/express@5.0.0` are the same publisher. */
function sameOwner(a: string, b: string): boolean {
  return a.split("@").slice(0, -1).join("@") === b.split("@").slice(0, -1).join("@");
}

/**
 * The list worth showing a human, sharpest first: exports the old README
 * documented, else everything that left the entrypoint, else the wide diff.
 */
export function headlineRemovals(d: DriftReport): string[] {
  if (d.documentedRemovals.length) return d.documentedRemovals;
  if (d.valueRemovals.length) return d.valueRemovals;
  return d.removedFromEntry.length ? d.removedFromEntry : d.withoutRunway;
}

/** How the headline list was arrived at, for a caption the reader can trust. */
export function headlineSource(d: DriftReport): string {
  const one = headlineRemovals(d).length === 1;
  if (d.documentedRemovals.length) {
    return one
      ? "export named in the old README, gone from the entrypoint with no deprecation first"
      : "exports named in the old README, gone from the entrypoint with no deprecation first";
  }
  if (d.valueRemovals.length) {
    return one
      ? "function, hook or class gone from the entrypoint with no deprecation first"
      : "functions, hooks and classes gone from the entrypoint with no deprecation first";
  }
  if (d.removedFromEntry.length) {
    return one
      ? "export gone from the entrypoint with no deprecation first"
      : "exports gone from the entrypoint with no deprecation first";
  }
  return one
    ? "symbol gone from a .d.ts in the package with no deprecation first"
    : "symbols gone from a .d.ts in the package with no deprecation first";
}

/**
 * Whether a scored run is likely to find anything, and why. Two facts drive
 * this, both measured across 35 libraries on this project's bench:
 *
 *  - the drift window closes. Age of the major predicts drift better than the
 *    size of the change does: Apollo v4 scored 0/12 once it had been out long
 *    enough, and zustand v5 was fully absorbed by ~19 months.
 *  - a removal with a deprecation runway produces almost nothing.
 */
export function driftVerdict(d: DriftReport): { worth: boolean; reason: string } {
  if (!d.readable) {
    return {
      worth: false,
      reason: `${d.package}'s type declarations could not be read: ${d.unreadableReason}`,
    };
  }
  const headline = headlineRemovals(d);
  if (!headline.length) {
    return {
      worth: false,
      reason: d.removed.length
        ? `${d.removed.length} symbol(s) went, but every one was deprecated first — that runway is what stops the drift`
        : `nothing was removed from the package entrypoint between v${d.from.major} and v${d.to.major}`,
    };
  }
  if (d.majorAgeMonths > 18) {
    return {
      worth: false,
      reason: `v${d.to.major} is ${d.majorAgeMonths.toFixed(0)} months old — old enough that models have absorbed it`,
    };
  }
  return {
    worth: true,
    reason:
      `${headline.length} ${headlineSource(d)}, ` +
      `in a major that is ${d.majorAgeMonths.toFixed(0)} months old`,
  };
}
