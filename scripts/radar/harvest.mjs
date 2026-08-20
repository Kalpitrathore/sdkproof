/**
 * Phase 0 — harvest candidate package names from the npm registry.
 * Free, no auth. Many queries x 250 results, deduped.
 */
import { writeFile } from "node:fs/promises";

const QUERIES = [
  "react","typescript","framework","sdk","client","orm","router","ui components","testing",
  "build tool","bundler","state management","forms","validation","graphql","database","auth",
  "api client","cli","logging","http","server","node","css-in-js","animation","charts","date",
  "i18n","payments","email","queue","cache","storage","ai","llm","agent","vector","observability",
  "monorepo","linter","formatter","schema","rpc","websocket","stream","parser","compiler",
];

const seen = new Map();
for (const q of QUERIES) {
  for (const from of [0, 250]) {
    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(q)}&size=250&from=${from}`;
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const j = await r.json();
      for (const o of j.objects ?? []) {
        const p = o.package;
        if (!p?.name) continue;
        // keep anything plausibly typed and non-trivial
        const score = o.score?.detail?.popularity ?? 0;
        if (score < 0.02) continue;
        if (!seen.has(p.name)) seen.set(p.name, score);
      }
    } catch {}
  }
  process.stderr.write(`  ${q}: ${seen.size} unique\n`);
}
const names = [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
await writeFile(new URL("candidates.json", import.meta.url), JSON.stringify(names, null, 0));
console.log(`harvested ${names.length} packages`);
