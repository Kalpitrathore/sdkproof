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
  "mode" | "fromCount" | "toCount" | "removed" | "withoutRunway" | "removedFromEntry" | "documentedRemovals" | "valueRemovals"
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

  return {
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
  if (d.documentedRemovals.length) {
    return "exports the old README documented, gone from the entrypoint with no deprecation first";
  }
  if (d.valueRemovals.length) {
    return "functions, hooks and classes gone from the entrypoint with no deprecation first";
  }
  if (d.removedFromEntry.length) return "exports gone from the entrypoint with no deprecation first";
  return "symbols gone from a .d.ts in the package with no deprecation first";
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
