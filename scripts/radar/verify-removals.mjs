/**
 * Stage 4 — the compiler decides. Static .d.ts diffing surfaces candidates and
 * is wrong in both directions about how many; this settles it.
 *
 * A symbol is a CONFIRMED removal only if BOTH hold:
 *   1. `import { S } from "pkg"` compiles against the PREVIOUS major  (it was public)
 *   2. the same import FAILS against the CURRENT major                 (it is gone)
 *
 * Condition 1 is what kills bundler internals like `$`, which the diff reports
 * but which were never importable from the package root either.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TSC = "/Users/kalpitrathore/Desktop/work/sdkproof/node_modules/typescript/lib/tsc.js";
const MAX_SYMBOLS = 60;
const CONC = 4;

const TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: "ES2022", module: "NodeNext", moduleResolution: "NodeNext",
    lib: ["ES2022", "DOM"], jsx: "react-jsx", strict: false, noEmit: true,
    skipLibCheck: true, esModuleInterop: true, noUnusedLocals: false,
  },
  include: ["probe.ts"],
});

/** Which of `symbols` are NOT exported from `pkg@version`? */
async function missingFrom(dir, pkg, version, symbols) {
  try {
    await exec("npm", ["install", "--silent", "--no-audit", "--no-fund", `${pkg}@${version}`],
      { cwd: dir, maxBuffer: 64 << 20, timeout: 240000 });
  } catch { return null; }
  const probe = `import { ${symbols.join(", ")} } from ${JSON.stringify(pkg)};\nexport const __probe = 1;\n`;
  await writeFile(path.join(dir, "probe.ts"), probe);
  let out = "";
  try {
    const r = await exec(process.execPath, [TSC, "-p", "tsconfig.json", "--pretty", "false"],
      { cwd: dir, maxBuffer: 64 << 20, timeout: 240000 });
    out = r.stdout;
  } catch (e) { out = (e.stdout ?? "") + (e.stderr ?? ""); }
  // TS2305 / TS2724 name the missing member in quotes.
  const missing = new Set();
  for (const m of out.matchAll(/error TS(?:2305|2724):[^\n]*?'([A-Za-z_$][\w$]*)'/g)) missing.add(m[1]);
  // A module that cannot resolve at all tells us nothing.
  if (/error TS2307/.test(out)) return null;
  return missing;
}

const hits = JSON.parse(await readFile(path.join(HERE, "radar-hits.json"), "utf8"));
const targets = hits.filter((h) => h.curFirst >= "2026-05-01");
console.log(`verifying ${targets.length} post-cutoff candidates with the compiler\n`);

const results = [];
let i = 0, done = 0;
await Promise.all(Array.from({ length: CONC }, async () => {
  while (i < targets.length) {
    const c = targets[i++];
    const syms = c.symbols.filter((s) => /^[A-Za-z_][\w$]*$/.test(s) && s.length > 1).slice(0, MAX_SYMBOLS);
    let rec = { ...c, confirmed: [], verdict: "unverifiable" };
    if (syms.length) {
      const dir = await mkdtemp(path.join(os.tmpdir(), "vr-"));
      try {
        await writeFile(path.join(dir, "package.json"), JSON.stringify({ name: "probe", private: true }));
        await writeFile(path.join(dir, "tsconfig.json"), TSCONFIG);
        const missPrev = await missingFrom(dir, c.name, c.prev, syms);
        const missCur = missPrev && (await missingFrom(dir, c.name, c.cur, syms));
        if (missPrev && missCur) {
          // public in prev (not missing there) AND gone in cur
          rec.confirmed = syms.filter((s) => !missPrev.has(s) && missCur.has(s));
          rec.verdict = rec.confirmed.length ? "CONFIRMED" : "false-positive";
        }
      } catch {} finally { await rm(dir, { recursive: true, force: true }).catch(() => {}); }
    }
    rec.reported = c.apolloShaped;
    results.push(rec);
    done++;
    process.stderr.write(`  ${done}/${targets.length}  ${c.name} -> ${rec.verdict} (${rec.confirmed.length}/${rec.reported})\n`);
    await writeFile(path.join(HERE, "verified.json"), JSON.stringify(results, null, 2));
  }
}));
results.sort((a, b) => b.confirmed.length - a.confirmed.length);
await writeFile(path.join(HERE, "verified.json"), JSON.stringify(results, null, 2));
const ok = results.filter((r) => r.verdict === "CONFIRMED");
console.log(`\nCONFIRMED: ${ok.length} · false positives: ${results.filter((r) => r.verdict === "false-positive").length} · unverifiable: ${results.filter((r) => r.verdict === "unverifiable").length}`);
