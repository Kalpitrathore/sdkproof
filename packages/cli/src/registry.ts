/**
 * npm registry access, with no dependencies. Everything here is one GET against
 * registry.npmjs.org and some arithmetic on the packument — no `npm` process,
 * no semver package.
 */

const REGISTRY = process.env.SDKPROOF_REGISTRY ?? "https://registry.npmjs.org";

export interface Packument {
  name: string;
  "dist-tags": Record<string, string>;
  versions: Record<string, VersionMeta>;
  time: Record<string, string>;
  readme?: string;
  description?: string;
  repository?: { url?: string } | string;
  homepage?: string;
}

export interface VersionMeta {
  name: string;
  version: string;
  description?: string;
  types?: string;
  typings?: string;
  readme?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  deprecated?: string;
  dist?: { tarball: string };
  exports?: unknown;
}

export async function fetchPackument(name: string): Promise<Packument> {
  // The scope slash must survive; only the name itself is escaped.
  const url = `${REGISTRY}/${name.replace(/\//g, "%2f")}`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (res.status === 404) throw new Error(`no such package on npm: ${name}`);
  if (!res.ok) throw new Error(`registry error for ${name}: ${res.status} ${res.statusText}`);
  return (await res.json()) as Packument;
}

/** Stable releases only — a prerelease is not what a user installs. */
export function stableVersions(p: Packument): string[] {
  return Object.keys(p.versions)
    .filter((v) => /^\d+\.\d+\.\d+$/.test(v))
    .sort(compareVersions);
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/**
 * Resolve what the user typed after the `@`. Accepts an exact version, a
 * dist-tag (`latest`, `next`), a major (`4`) or a major.minor (`4.2`), and
 * nothing at all — which means the `latest` tag, i.e. what `npm i pkg` gives.
 */
export function resolveVersion(p: Packument, spec?: string): string {
  const stable = stableVersions(p);
  if (!spec || spec === "latest") {
    const tag = p["dist-tags"]?.latest;
    if (tag) return tag;
    if (!stable.length) throw new Error(`${p.name} has no stable release`);
    return stable[stable.length - 1];
  }
  if (p["dist-tags"]?.[spec]) return p["dist-tags"][spec];
  if (p.versions[spec]) return spec;
  if (/^\d+(\.\d+)?$/.test(spec)) {
    const matches = stable.filter((v) => v === spec || v.startsWith(`${spec}.`));
    if (matches.length) return matches[matches.length - 1];
  }
  throw new Error(`${p.name} has no version matching "${spec}"`);
}

export interface MajorLine {
  major: number;
  /** ISO date the first release in this major line was published */
  first: string;
  /** highest stable version in the line */
  latest: string;
}

/** Every stable major line, oldest first, with the date the major landed. */
export function majorLines(p: Packument): MajorLine[] {
  const byMajor = new Map<number, MajorLine>();
  for (const v of stableVersions(p)) {
    const major = Number(v.split(".")[0]);
    const published = p.time?.[v];
    const cur = byMajor.get(major);
    if (!cur) {
      byMajor.set(major, { major, first: published ?? "", latest: v });
      continue;
    }
    if (compareVersions(v, cur.latest) > 0) cur.latest = v;
    if (published && (!cur.first || new Date(published) < new Date(cur.first))) cur.first = published;
  }
  return [...byMajor.values()].sort((a, b) => a.major - b.major);
}

export function monthsSince(iso: string): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
}

/**
 * The README as published for a specific version. The packument carries the
 * README of the latest release at the top level, which is the wrong document
 * when an older version is being scored — so the per-version copy wins when the
 * registry has one.
 */
export function readmeFor(p: Packument, version: string): string {
  return p.versions[version]?.readme ?? (version === p["dist-tags"]?.latest ? p.readme ?? "" : "");
}

/** The peers a consumer is expected to install themselves, optional ones dropped. */
export function requiredPeers(meta: VersionMeta): string[] {
  const peers = meta.peerDependencies ?? {};
  return Object.keys(peers).filter((name) => !meta.peerDependenciesMeta?.[name]?.optional);
}

export function repoUrl(p: Packument): string | undefined {
  const r = typeof p.repository === "string" ? p.repository : p.repository?.url;
  return r?.replace(/^git\+/, "").replace(/\.git$/, "");
}
