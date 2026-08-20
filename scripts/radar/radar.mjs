/**
 * SDKProof radar — scaled target discovery. ZERO model API calls.
 *
 * Phase 1  packument metadata  -> keep majors shipped in the last N months (rung 1)
 * Phase 2  .d.ts diff of the pair -> removed exported symbols (rung 2)
 * Phase 3  @deprecated check on each removal -> rule 5, the ranking key
 *
 * Only removals with NO deprecation runway are Apollo-shaped. Everything else
 * is absorbed long before it is deleted.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, readdir, mkdtemp, rm, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_AGE_MONTHS = Number(process.env.MAX_AGE_MONTHS ?? 14);
const TOP_N = Number(process.env.TOP_N ?? 500);
const P1_CONC = 24, P2_CONC = 6;

const sh = async (c, a, o = {}) => (await exec(c, a, { maxBuffer: 64 << 20, ...o })).stdout;
async function pool(items, limit, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { await fn(items[k], k); } catch {} }
  }));
}

// ---------- phase 1 ----------
const names = JSON.parse(await readFile(path.join(HERE, "candidates.json"), "utf8")).slice(0, TOP_N);
const stage1 = [];
let done1 = 0;
await pool(names, P1_CONC, async (name) => {
  done1++;
  if (done1 % 50 === 0) process.stderr.write(`  phase1 ${done1}/${names.length} · ${stage1.length} pass\n`);
  let doc;
  try {
    const r = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}`);
    if (!r.ok) return;
    doc = await r.json();
  } catch { return; }
  const time = doc.time ?? {};
  const rows = Object.entries(time).filter(([v]) => /^\d+\.\d+\.\d+$/.test(v));
  if (!rows.length) return;
  const byMajor = new Map();
  const cmp = (a, b) => a.split(".").map(Number).reduce((x, n, i) => x || n - +b.split(".")[i], 0);
  for (const [v, d] of rows) {
    const m = +v.split(".")[0], cur = byMajor.get(m);
    if (!cur) byMajor.set(m, { latest: v, first: d });
    else { if (cmp(v, cur.latest) > 0) cur.latest = v; if (new Date(d) < new Date(cur.first)) cur.first = d; }
  }
  const majors = [...byMajor.entries()].sort((a, b) => a[0] - b[0]);
  if (majors.length < 2) return;
  const [prevM, prev] = majors.at(-2), [curM, cur] = majors.at(-1);
  const ageMonths = (Date.now() - new Date(cur.first)) / 2.629746e9;
  if (ageMonths > MAX_AGE_MONTHS) return;
  if (curM === 0) return; // 0.x churn is not a major
  stage1.push({ name, prevMajor: prevM, curMajor: curM, prev: prev.latest, cur: cur.latest,
                curFirst: cur.first.slice(0, 10), ageMonths: +ageMonths.toFixed(1) });
});
stage1.sort((a, b) => a.ageMonths - b.ageMonths);
await writeFile(path.join(HERE, "stage1.json"), JSON.stringify(stage1, null, 2));
console.log(`phase 1: ${stage1.length} of ${names.length} have a major inside ${MAX_AGE_MONTHS}mo`);

// ---------- phases 2 + 3 ----------
const TYPE_CANDIDATES = (pkg) => {
  const out = [];
  const push = (p) => { if (typeof p === "string") out.push(p.replace(/^\.\//, "")); };
  push(pkg.types); push(pkg.typings);
  const deep = (o, d = 0) => { if (d > 3 || !o) return;
    if (typeof o === "string") return push(o);
    if (typeof o === "object") for (const v of Object.values(o)) deep(v, d + 1); };
  deep(pkg.exports?.["."]);
  out.push("index.d.ts","dist/index.d.ts","types/index.d.ts","lib/index.d.ts","dist/types/index.d.ts",
           "dist/node/index.d.ts","dist/index.d.mts","index.d.mts","dist/esm/index.d.ts","build/index.d.ts");
  return [...new Set(out.filter((p) => p && /\.d\.[cm]?ts$/.test(p)))];
};
async function allDts(dir, acc = [], d = 0) {
  if (d > 6) return acc;
  let e = []; try { e = await readdir(dir, { withFileTypes: true }); } catch { return acc; }
  for (const x of e) { const p = path.join(dir, x.name);
    if (x.isDirectory()) await allDts(p, acc, d + 1); else if (/\.d\.[cm]?ts$/.test(x.name)) acc.push(p); }
  return acc;
}
function symbolsFromSource(src) {
  const out = new Set();
  for (const m of src.matchAll(/export\s*(?:type\s*)?\{([^}]*)\}/gs))
    for (let p of m[1].split(",")) { p = p.trim().replace(/^type\s+/, ""); if (!p) continue;
      const n = p.split(/\s+as\s+/).pop().trim(); if (/^[A-Za-z_$][\w$]*$/.test(n)) out.add(n); }
  for (const m of src.matchAll(/^export\s+declare\s+(?:abstract\s+)?(?:function|const|let|var|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/gm)) out.add(m[1]);
  for (const m of src.matchAll(/^export\s+(?:interface|type|enum|abstract class|class|function|const)\s+([A-Za-z_$][\w$]*)/gm)) out.add(m[1]);
  return out;
}
function isDeprecated(sources, sym) {
  const decl = new RegExp(`(?:interface|type|declare\\s+(?:const|function|class|abstract\\s+class|enum)|class|function|const|enum)\\s+${sym}\\b`);
  for (const src of sources) {
    const lines = src.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!decl.test(lines[i])) continue;
      const win = lines.slice(Math.max(0, i - 25), i).join("\n");
      const c = win.lastIndexOf("*/");
      const seg = c === -1 ? win : win.slice(win.lastIndexOf("/**", c), c);
      if (/@deprecated/.test(seg)) return true;
    }
  }
  return false;
}
async function fetchPkg(name, version, tmp) {
  const dir = path.join(tmp, version);
  await sh("mkdir", ["-p", dir]);
  await sh("npm", ["pack", `${name}@${version}`, "--silent", "--pack-destination", dir], { cwd: tmp });
  const f = (await readdir(dir)).find((x) => x.endsWith(".tgz"));
  if (!f) throw new Error("no tarball");
  const ext = path.join(dir, "x"); await sh("mkdir", ["-p", ext]);
  await sh("tar", ["-xzf", path.join(dir, f), "-C", ext, "--strip-components=1"]);
  return ext;
}
/**
 * Resolve the package's real public surface by FOLLOWING relative re-exports.
 *
 * Reading the entry file alone is wrong and wrong in the direction that
 * manufactures findings: a package that moves from one bundled index.d.ts to a
 * thin entry that says `export * from "./types"` looks like it deleted its
 * whole API. react-plaid-link reported 20 removals that way on 2026-08-19 and
 * every one of them still imports fine from the package root.
 */
async function resolveSurface(file, seen = new Set(), depth = 0) {
  if (depth > 8 || seen.has(file)) return new Set();
  seen.add(file);
  let src = "";
  try { src = await readFile(file, "utf8"); } catch { return new Set(); }
  const out = symbolsFromSource(src);
  const dir = path.dirname(file);
  const specs = [...src.matchAll(/export\s*(?:\*|\{[^}]*\})\s*from\s*["'](\.[^"']+)["']/g)].map((m) => m[1]);
  for (const spec of specs) {
    const base = path.resolve(dir, spec).replace(/\.(js|mjs|cjs|d\.ts|d\.mts)$/, "");
    for (const cand of [`${base}.d.ts`, `${base}.d.mts`, `${base}.d.cts`,
                        path.join(base, "index.d.ts"), path.join(base, "index.d.mts")]) {
      try { await stat(cand); for (const x of await resolveSurface(cand, seen, depth + 1)) out.add(x); break; } catch {}
    }
  }
  return out;
}

async function load(ext) {
  let pkg = {}; try { pkg = JSON.parse(await readFile(path.join(ext, "package.json"), "utf8")); } catch {}
  let entry = null;
  for (const c of TYPE_CANDIDATES(pkg)) { try { await stat(path.join(ext, c)); entry = path.join(ext, c); break; } catch {} }
  if (!entry) return null;
  const files = await allDts(ext);
  const sources = await Promise.all(files.map((f) => readFile(f, "utf8").catch(() => "")));
  return { entryOnly: await resolveSurface(entry), sources };
}

const hits = [];
let done2 = 0;
await pool(stage1, P2_CONC, async (c) => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), "rad-"));
  try {
    const [o, n] = await Promise.all([fetchPkg(c.name, c.prev, tmp), fetchPkg(c.name, c.cur, tmp)])
      .then(([a, b]) => Promise.all([load(a), load(b)]));
    if (!o || !n) return;
    const removed = [...o.entryOnly].filter((s) => !n.entryOnly.has(s))
      .filter((s) => !s.startsWith("UNSAFE_") && !s.startsWith("unstable_") && !s.startsWith("__"));
    if (!removed.length) return;
    const live = removed.filter((s) => !isDeprecated(o.sources, s));
    if (live.length) hits.push({ ...c, removed: removed.length, apolloShaped: live.length, symbols: live.slice(0, 12) });
  } catch {} finally {
    await rm(tmp, { recursive: true, force: true }).catch(() => {});
    done2++;
    if (done2 % 10 === 0) {
      process.stderr.write(`  phase2 ${done2}/${stage1.length} · ${hits.length} hits\n`);
      await writeFile(path.join(HERE, "radar-hits.json"), JSON.stringify(hits.sort((a,b)=>b.apolloShaped-a.apolloShaped), null, 2));
    }
  }
});
hits.sort((a, b) => b.apolloShaped - a.apolloShaped);
await writeFile(path.join(HERE, "radar-hits.json"), JSON.stringify(hits, null, 2));
console.log(`\nphase 2: ${hits.length} packages with undeprecated public removals`);
