// Generates the README badges: one SVG and one shields.io endpoint per scored
// library, plus the copy-paste page that hands them to maintainers.
//
// Why this exists: a badge in someone else's README is the only thing on this
// project that sends traffic without a post being written first — and every embed
// is also a backlink, which is the actual reason five of six scorecard pages have
// never surfaced in a search result.
//
// Scores are read from data/<slug>.result.json — the same file the scorecard page
// is built from — so a badge can never quietly disagree with the run it claims to
// report. Re-run this whenever a score moves.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs", "badge");
mkdirSync(outDir, { recursive: true });

const SITE = "https://sdkproof.dev";
const LABEL = "SDKProof";

// slug -> the result file, the page the badge links to, and the display name.
const LIBS = [
  { slug: "tanstack-query", name: "TanStack Query v5", page: "tanstack-query.html" },
  { slug: "aisdk", name: "Vercel AI SDK 7", page: "aisdk.html" },
  { slug: "zod", name: "Zod 4", page: "zod.html" },
  { slug: "react-router", name: "React Router 8", page: "react-router.html" },
  { slug: "nextjs", name: "Next.js 16", page: "nextjs.html" },
  { slug: "prisma7", name: "Prisma 7", page: "prisma7.html" },
  // `badge: false` — published scorecard, no SVG. A badge is one number by
  // construction, and this is the one run where one number is the wrong answer:
  // 100% of what the model wrote, 67% of what it was asked. It still belongs in
  // scores.json, where both rates fit.
  { slug: "stripe", name: "Stripe 22", page: "stripe.html", badge: false },
];

// Light-theme brand tokens rather than the shields defaults: white on #4c1 is the
// badge convention and it is barely legible. These clear 3:1 against white.
const colorFor = (n) => (n >= 95 ? "1a7f37" : n >= 90 ? "0e9aa7" : "9a6700");

// Verdana 11px advance widths, close enough to lay out a two-segment badge. Every
// <text> also carries textLength, so the glyphs are pinned to the box we reserved
// even when the viewer's machine substitutes a different font.
const NARROW = new Set([..."ijlt.,:;/|'!()[]"]);
const WIDE = new Set([..."mwMW@"]);
const charWidth = (c) => {
  if (NARROW.has(c)) return 3.8;
  if (WIDE.has(c)) return 9.5;
  if (c === " ") return 3.6;
  if (c >= "0" && c <= "9") return 6.9;
  if (c >= "A" && c <= "Z") return 7.3;
  return 6.6;
};
const textWidth = (s) => [...s].reduce((w, c) => w + charWidth(c), 0);

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const PAD = 12; // 6px either side of each segment

function badgeSvg({ slug, message, color }) {
  const labelText = Math.round(textWidth(LABEL));
  const msgText = Math.round(textWidth(message));
  const labelW = labelText + PAD;
  const msgW = msgText + PAD;
  const w = labelW + msgW;
  const alt = `${LABEL}: ${message}`;
  // Unique per file so two inlined badges could never share gradient/clip ids.
  const gid = `g-${slug}`;
  const rid = `r-${slug}`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${esc(alt)}">
  <title>${esc(alt)}</title>
  <linearGradient id="${gid}" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="${rid}"><rect width="${w}" height="20" rx="3" fill="#fff"/></clipPath>
  <g clip-path="url(#${rid})">
    <rect width="${labelW}" height="20" fill="#20262e"/>
    <rect x="${labelW}" width="${msgW}" height="20" fill="#${color}"/>
    <rect width="${w}" height="20" fill="url(#${gid})"/>
  </g>
  <g font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">
    <text x="${labelW / 2}" y="15" fill="#010101" fill-opacity=".3" textLength="${labelText}">${esc(LABEL)}</text>
    <text x="${labelW / 2}" y="14" fill="#fff" textLength="${labelText}">${esc(LABEL)}</text>
    <text x="${labelW + msgW / 2}" y="15" fill="#010101" fill-opacity=".3" textLength="${msgText}">${esc(message)}</text>
    <text x="${labelW + msgW / 2}" y="14" fill="#fff" textLength="${msgText}">${esc(message)}</text>
  </g>
</svg>
`;
  // The page preview needs the real width — every badge is a different size, and an
  // <img> with the wrong one squashes it.
  return { svg, width: w };
}

/**
 * Wilson 95% interval, kept in sync with src/stats.ts. Duplicated rather than
 * imported because the build scripts are plain .mjs and the harness is .ts;
 * test/stats.test.ts pins the arithmetic on the TS side.
 */
const wilson = (k, n, z = 1.959963984540054) => {
  if (!(n > 0)) throw new Error(`wilson: empty denominator (n=${n})`);
  const p = k / n;
  const z2 = z * z;
  const d = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / d;
  const margin = (z / d) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  const trim = (x) => Number(x.toFixed(4));
  return { low: k === 0 ? 0 : trim(Math.max(0, center - margin)), high: k === n ? 1 : trim(Math.min(1, center + margin)) };
};

const rows = LIBS.map((lib) => {
  const result = JSON.parse(readFileSync(path.join(root, "data", `${lib.slug}.result.json`), "utf8"));
  const model = result.perModel?.[0] ?? {};

  // A `--fake` smoke run writes the same data/<lib>.result.json a real run does.
  // On 2026-08-04 one did exactly that to zod, and this script published the
  // result: docs/badge/zod.json went live reading "0/100" from a model called
  // fake-bad, while the scorecard page still said 100. The badge's whole claim is
  // that it cannot disagree with the run it reports, so this refuses to build
  // rather than publish a number no real model produced. cli.ts now writes fake
  // runs to a .fake label so this should never fire again.
  if (/^fake-/.test(model.model ?? "")) {
    throw new Error(
      `data/${lib.slug}.result.json is a --fake run (model "${model.model}"). ` +
        `Re-score it for real before building badges — publishing this would put a fake number in someone's README.`,
    );
  }

  const score = result.overallScore;
  const message = `${score}/100`;
  const color = colorFor(score);

  const badge = badgeSvg({ slug: lib.slug, message, color });
  if (lib.badge !== false) {
    writeFileSync(path.join(outDir, `${lib.slug}.svg`), badge.svg);

    // shields.io endpoint, for maintainers who would rather point at shields than at
    // a stranger's domain. Same numbers, same source file.
    writeFileSync(
      path.join(outDir, `${lib.slug}.json`),
      JSON.stringify({ schemaVersion: 1, label: LABEL, message, color }) + "\n"
    );
  }

  return {
    ...lib,
    score,
    message,
    badgeWidth: badge.width,
    version: result.libraryVersion,
    passed: model.passed,
    total: model.total,
    refused: (result.refusals ?? []).filter((r) => r.model === model.model).length,
    model: model.model,
  };
});

// One machine-readable file for every score on the board. Cheap to emit here since
// the results are already loaded, and it means a badge, a scorecard and anything
// that wants to quote a number are all reading the same run.
writeFileSync(
  path.join(root, "docs", "scores.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString().slice(0, 10),
      note: "Each score is one model solving 10-15 realistic tasks, type-checked against the installed package. Pass = compiles clean.",
      // Two rates per library, never one. `score` stays the conditional number
      // for anything already reading this file; `unconditionalScore` counts the
      // tasks the model refused to write as the non-answers they are. Where
      // nothing was refused the two are equal, which is the point — the gap is
      // only visible if both are always published. Intervals are Wilson 95%,
      // because these denominators are 10-15 and a bare 100% overstates that.
      metrics: {
        score: "conditional API correctness: passes / completions that produced code",
        unconditionalScore: "unconditional task success: passes / every task asked, refusals included",
        ci95: "Wilson 95% interval on the same numerator and denominator, as [low, high] proportions",
      },
      scores: rows.map((r) => ({
        library: r.name,
        slug: r.slug,
        libraryVersion: r.version,
        model: r.model,
        score: r.score,
        unconditionalScore: Math.round((100 * r.passed) / (r.total + r.refused)),
        passed: r.passed,
        total: r.total,
        refused: r.refused,
        attempted: r.total + r.refused,
        ci95: {
          score: [wilson(r.passed, r.total).low, wilson(r.passed, r.total).high],
          unconditionalScore: [
            wilson(r.passed, r.total + r.refused).low,
            wilson(r.passed, r.total + r.refused).high,
          ],
        },
        scorecard: `${SITE}/${r.page}`,
        ...(r.badge === false ? {} : { badge: `${SITE}/badge/${r.slug}.svg` }),
      })),
    },
    null,
    2
  ) + "\n"
);

const snippet = (r) =>
  `[![${LABEL}: ${r.message}](${SITE}/badge/${r.slug}.svg)](${SITE}/${r.page}?ref=badge)`;

const cards = rows
  .filter((r) => r.badge !== false)
  .map(
    (r) => `      <div class="badge-row">
        <div class="badge-head">
          <img class="badge-img" src="badge/${r.slug}.svg" alt="${esc(`${LABEL}: ${r.message}`)}" width="${r.badgeWidth}" height="20">
          <span class="badge-lib">${esc(r.name)} <span class="badge-ver">${esc(r.version)}</span></span>
        </div>
        <pre class="snip"><code>${esc(snippet(r))}</code></pre>
      </div>`
  )
  .join("\n");

const page = `<title>SDKProof — README badges</title>
<style>
  /* ---------- tokens: light is the base, dark is a redefinition ---------- */
  :root {
    color-scheme: light;
    --bg: #f7f8f7;
    --bg-line: rgba(14,18,22,.055);
    --panel: #ffffff;
    --panel-2: #f1f3f2;
    --ink: #0e1216;
    --ink-soft: #4a545e;
    --ink-faint: #78838e;
    --line: #e2e7e5;
    --line-2: #d1d8d5;
    --accent: #0a7f74;
    --accent-soft: #e4f2f0;
    --on-accent: #ffffff;
    --pass: #16794a;
    --warn: #9a6a00;
    --fail: #c62f3b;
    --code-bg: #fbfcfb;
    --tok-com: #79848f;
    --tok-kw: #8b34c9;
    --tok-str: #0b6484;
    --tok-fn: #a4560a;
    --tok-typ: #0a7f74;
    --hi-bad: rgba(198,47,59,.13);
    --hi-good: rgba(22,121,74,.13);
    --shadow: 0 1px 2px rgba(14,18,22,.05), 0 14px 34px rgba(14,18,22,.07);
    --font-body: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --font-mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, "Cascadia Code", "Roboto Mono", monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      color-scheme: dark;
      --bg: #0a0d11;
      --bg-line: rgba(255,255,255,.045);
      --panel: #0f141a;
      --panel-2: #141a22;
      --ink: #e9eff4;
      --ink-soft: #a0aeba;
      --ink-faint: #6e7c89;
      --line: #1d2530;
      --line-2: #2b3542;
      --accent: #3fd8b8;
      --accent-soft: #0d2b27;
      --on-accent: #04211d;
      --pass: #3ecf7f;
      --warn: #e0a83a;
      --fail: #f2656f;
      --code-bg: #0c1117;
      --tok-com: #6e7c89;
      --tok-kw: #c48cf5;
      --tok-str: #7cc7f0;
      --tok-fn: #f0b866;
      --tok-typ: #4fd6bd;
      --hi-bad: rgba(242,101,111,.17);
      --hi-good: rgba(62,207,127,.15);
      --shadow: 0 1px 2px rgba(0,0,0,.5), 0 16px 42px rgba(0,0,0,.5);
    }
  }
  :root[data-theme="dark"] {
    color-scheme: dark;
    --bg: #0a0d11;
    --bg-line: rgba(255,255,255,.045);
    --panel: #0f141a;
    --panel-2: #141a22;
    --ink: #e9eff4;
    --ink-soft: #a0aeba;
    --ink-faint: #6e7c89;
    --line: #1d2530;
    --line-2: #2b3542;
    --accent: #3fd8b8;
    --accent-soft: #0d2b27;
    --on-accent: #04211d;
    --pass: #3ecf7f;
    --warn: #e0a83a;
    --fail: #f2656f;
    --code-bg: #0c1117;
    --tok-com: #6e7c89;
    --tok-kw: #c48cf5;
    --tok-str: #7cc7f0;
    --tok-fn: #f0b866;
    --tok-typ: #4fd6bd;
    --hi-bad: rgba(242,101,111,.17);
    --hi-good: rgba(62,207,127,.15);
    --shadow: 0 1px 2px rgba(0,0,0,.5), 0 16px 42px rgba(0,0,0,.5);
  }

  /* ---------- base ---------- */
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body {
    margin: 0;
    background-color: var(--bg);
    background-image:
      linear-gradient(var(--bg-line) 1px, transparent 1px),
      linear-gradient(90deg, var(--bg-line) 1px, transparent 1px);
    background-size: 72px 72px, 72px 72px;
    background-position: -1px -1px, -1px -1px;
    color: var(--ink);
    font-family: var(--font-body);
    font-size: 16px;
    line-height: 1.62;
    overflow-x: hidden;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 1080px; margin: 0 auto; padding: 0 22px 96px; }
  h1, h2, h3 { margin: 0; letter-spacing: -.022em; line-height: 1.1; text-wrap: balance; }
  p { margin: 0; }
  a { color: var(--accent); }
  code, pre, .num { font-family: var(--font-mono); }
  code { font-size: .9em; }
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 4px; }

  .eyebrow {
    font-size: 11px; font-weight: 700; letter-spacing: .17em; text-transform: uppercase;
    color: var(--ink-faint); display: block;
  }
  .rule { height: 1px; background: var(--line); border: 0; margin: 0; }

  /* ---------- masthead ---------- */
  .mast { display: flex; align-items: center; gap: 12px; padding: 24px 0 0; }
  .logo { font-weight: 700; font-size: 16px; letter-spacing: -.03em; color: var(--ink); }
  .logo b { color: var(--accent); font-weight: 700; }
  .mast .navs { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; }
  .mast .gh {
    font-size: 13px; font-weight: 600; color: var(--ink-soft);
    text-decoration: none; border: 1px solid var(--line-2); border-radius: 999px; padding: 5px 14px;
  }
  .mast .gh:hover { border-color: var(--accent); color: var(--accent); }

  /* ---------- hero ---------- */
  .hero { padding: 58px 0 0; }
  .hero h1 {
    font-size: clamp(32px, 6.4vw, 62px); font-weight: 800; letter-spacing: -.04em; line-height: 1.0;
    margin: 18px 0 0;
  }
  .hero h1 .dim { color: var(--ink-faint); }
  .hero .pkg {
    display: inline-block; margin-top: 14px; font-family: var(--font-mono); font-size: 12.5px;
    color: var(--ink-soft); background: var(--panel); border: 1px solid var(--line-2);
    border-radius: 999px; padding: 5px 13px;
  }
  .lede { max-width: 64ch; margin-top: 28px; }
  .lede p { color: var(--ink-soft); font-size: clamp(16px, 2.1vw, 18.5px); margin-bottom: 15px; }
  .lede p:last-child { margin-bottom: 0; }
  .lede b { color: var(--ink); font-weight: 650; }
  .verdict-line {
    display: inline-flex; align-items: center; gap: 10px; margin-top: 24px;
    font-size: 14px; font-weight: 600; color: var(--ink);
    background: var(--accent-soft); border: 1px solid var(--accent);
    border-radius: 999px; padding: 7px 16px 7px 12px;
  }
  .verdict-line svg { flex: none; }

  /* ---------- score panel ---------- */
  .scorebox {
    display: grid; grid-template-columns: auto 1fr; gap: 34px; align-items: center;
    margin-top: 44px; padding: 26px 28px; background: var(--panel);
    border: 1px solid var(--line-2); border-radius: 16px; box-shadow: var(--shadow);
  }
  @media (max-width: 720px) { .scorebox { grid-template-columns: 1fr; gap: 24px; padding: 22px 20px; } }
  .scorebox .big {
    font-family: var(--font-mono); font-size: clamp(50px, 9vw, 74px); font-weight: 700;
    letter-spacing: -.05em; line-height: .9; font-variant-numeric: tabular-nums; display: block;
  }
  .scorebox .big s { text-decoration: none; font-size: 21px; color: var(--ink-faint); letter-spacing: -.02em; }
  .scorebox .lbl {
    display: block; margin-top: 13px; font-size: 11px; font-weight: 700; letter-spacing: .17em;
    text-transform: uppercase; color: var(--ink-faint);
  }
  .s-fail { color: var(--fail); }
  .s-warn { color: var(--warn); }
  .s-ok   { color: var(--ink); }
  .s-pass { color: var(--pass); }
  .ticks { display: flex; gap: 4px; }
  .ticks i { flex: 1 1 0; height: 26px; border-radius: 3px; background: var(--pass); }
  .ticks i.x { background: var(--fail); }
  .ticks i.r { background: var(--line-2); }
  .legend { display: flex; flex-wrap: wrap; gap: 8px 20px; margin-top: 13px; font-size: 12.5px; color: var(--ink-faint); }
  .legend b { color: var(--ink); font-weight: 650; font-variant-numeric: tabular-nums; }
  .legend .sw { display: inline-block; width: 9px; height: 9px; border-radius: 2px; margin-right: 6px; }
  .sw.p { background: var(--pass); }
  .sw.f { background: var(--fail); }
  .sw.r { background: var(--line-2); }

  .facts { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 16px; }
  .facts span {
    font-size: 12.5px; color: var(--ink-soft); background: var(--panel);
    border: 1px solid var(--line); border-radius: 999px; padding: 6px 14px;
  }
  .facts b { color: var(--ink); font-weight: 650; }

  /* ---------- section heads ---------- */
  .sec { margin-top: 82px; }
  .sec > .head { max-width: 66ch; margin-bottom: 24px; }
  .sec h2 { font-size: clamp(24px, 4vw, 36px); font-weight: 780; margin: 12px 0 0; }
  .sec .head p { color: var(--ink-soft); font-size: 16.5px; margin-top: 14px; }
  .sec .head p b { color: var(--ink); font-weight: 650; }
  .sec .head p + p { margin-top: 12px; }

  /* ---------- code comparison ---------- */
  .cmp { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; align-items: start; }
  @media (max-width: 900px) { .cmp { grid-template-columns: 1fr; } }
  .cmp + .cmp { margin-top: 22px; }
  .pane {
    margin: 0; background: var(--panel); border: 1px solid var(--line-2);
    border-radius: 14px; overflow: hidden; box-shadow: var(--shadow);
  }
  .pane figcaption {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 13px 16px; border-bottom: 1px solid var(--line); background: var(--panel-2);
  }
  .pane .dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
  .pane.bad .dot { background: var(--fail); }
  .pane.good .dot { background: var(--pass); }
  .pane .pl { font-size: 13.5px; font-weight: 650; color: var(--ink); }
  .pane .pv { margin-left: auto; font-size: 11.5px; color: var(--ink-faint); }
  .pane .scroll { overflow-x: auto; background: var(--code-bg); }
  .pane pre {
    margin: 0; padding: 18px 18px 20px; font-size: 12.5px; line-height: 1.72;
    color: var(--ink); tab-size: 2;
  }
  .pane .out {
    border-top: 1px solid var(--line); padding: 13px 16px; font-family: var(--font-mono);
    font-size: 11.5px; line-height: 1.65; white-space: pre-wrap; overflow-wrap: anywhere;
  }
  .pane.bad .out { color: var(--fail); background: var(--hi-bad); }
  .pane.good .out { color: var(--pass); background: var(--hi-good); }
  .c-com { color: var(--tok-com); }
  .c-kw  { color: var(--tok-kw); }
  .c-str { color: var(--tok-str); }
  .c-fn  { color: var(--tok-fn); }
  .c-typ { color: var(--tok-typ); }
  .bad-t  { background: var(--hi-bad); border-bottom: 1.5px solid var(--fail); border-radius: 2px; padding: 0 2px; }
  .good-t { background: var(--hi-good); border-bottom: 1.5px solid var(--pass); border-radius: 2px; padding: 0 2px; }
  .cap { font-size: 13px; color: var(--ink-faint); margin-top: 16px; max-width: 70ch; }
  .cap b { color: var(--ink-soft); font-weight: 650; }

  /* ---------- panels of prose ---------- */
  .panel {
    background: var(--panel); border: 1px solid var(--line-2); border-radius: 14px;
    padding: 24px 26px; box-shadow: var(--shadow);
  }
  @media (max-width: 640px) { .panel { padding: 20px 18px; } }
  .panel h3 { font-size: 17.5px; font-weight: 720; margin: 26px 0 9px; }
  .panel h3:first-child { margin-top: 0; }
  .panel p { color: var(--ink-soft); font-size: 15px; margin-bottom: 13px; max-width: 74ch; }
  .panel p:last-child { margin-bottom: 0; }
  .panel b { color: var(--ink); font-weight: 650; }
  .panel .lead-in { color: var(--ink); }

  /* ---------- chips ---------- */
  .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 16px; }
  .chip {
    font-family: var(--font-mono); font-size: 12px; color: var(--ink-soft);
    background: var(--panel-2); border: 1px solid var(--line); border-radius: 999px; padding: 5px 13px;
  }
  .chip::before { content: "\\2713"; color: var(--pass); font-weight: 700; margin-right: 6px; }
  .chip.key { border-color: var(--accent); color: var(--ink); background: var(--accent-soft); }

  /* ---------- tables ---------- */
  .tblwrap {
    overflow-x: auto; background: var(--panel); border: 1px solid var(--line-2);
    border-radius: 14px; box-shadow: var(--shadow);
  }
  table.t { width: 100%; border-collapse: collapse; font-size: 14.5px; min-width: 540px; }
  table.t th {
    text-align: left; font-size: 10.5px; font-weight: 700; letter-spacing: .14em;
    text-transform: uppercase; color: var(--ink-faint); padding: 15px 18px;
    border-bottom: 1px solid var(--line-2); white-space: nowrap;
  }
  table.t td { padding: 13px 18px; border-bottom: 1px solid var(--line); color: var(--ink-soft); }
  table.t tr:last-child td { border-bottom: 0; }
  table.t td.l { color: var(--ink); font-weight: 650; }
  table.t td.n { font-family: var(--font-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
  table.t td.good { color: var(--pass); font-weight: 700; }
  table.t td.bad { color: var(--fail); font-weight: 700; }
  table.t td.dim { color: var(--ink-faint); }
  table.t th.r, table.t td.r { text-align: right; }

  /* ---------- limits ---------- */
  .limits { border-top: 1px solid var(--line-2); }
  .limits div { display: grid; grid-template-columns: 178px 1fr; gap: 24px; padding: 18px 0; border-bottom: 1px solid var(--line); }
  .limits dt { font-size: 14px; font-weight: 700; color: var(--ink); }
  .limits dd { margin: 0; font-size: 14.5px; color: var(--ink-soft); }
  .limits dd code { color: var(--ink); }
  @media (max-width: 640px) { .limits div { grid-template-columns: 1fr; gap: 6px; } }

  /* ---------- callout ---------- */
  .callout {
    background: var(--panel); border: 1px solid var(--line-2); border-left: 3px solid var(--accent);
    border-radius: 0 14px 14px 0; padding: 20px 22px; margin-top: 20px;
  }
  .callout p { color: var(--ink-soft); font-size: 15px; margin-bottom: 12px; max-width: 74ch; }
  .callout p:last-child { margin-bottom: 0; }
  .callout b { color: var(--ink); font-weight: 650; }

  /* ---------- board of other scores ---------- */
  .board { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
  .card {
    display: flex; flex-direction: column; text-decoration: none; color: inherit;
    background: var(--panel); border: 1px solid var(--line-2); border-radius: 14px;
    padding: 18px; box-shadow: var(--shadow); transition: border-color .13s, transform .13s;
  }
  a.card:hover { border-color: var(--accent); transform: translateY(-2px); }
  .card .top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .card .name { font-size: 15.5px; font-weight: 720; letter-spacing: -.02em; }
  .card .score {
    font-family: var(--font-mono); font-size: 27px; font-weight: 700; letter-spacing: -.04em;
    line-height: 1; font-variant-numeric: tabular-nums;
  }
  .card .score s { text-decoration: none; font-size: 12px; color: var(--ink-faint); }
  .card .ratio { font-size: 12px; color: var(--ink-faint); margin-top: 8px; font-variant-numeric: tabular-nums; }
  .card .why { font-size: 13px; color: var(--ink-soft); margin-top: 10px; }
  .card.cur { border-color: var(--accent); }
  .card.cur .why { color: var(--ink); }

  /* ---------- finding links ---------- */
  .finding {
    display: flex; align-items: center; gap: 18px; flex-wrap: wrap; text-decoration: none;
    margin-top: 14px; padding: 20px 22px; background: var(--panel);
    border: 1px solid var(--line-2); border-left: 3px solid var(--accent); border-radius: 0 14px 14px 0;
  }
  .finding:hover { border-color: var(--accent); }
  .finding .fl { font-size: 10.5px; font-weight: 700; letter-spacing: .15em; text-transform: uppercase; color: var(--accent); white-space: nowrap; }
  .finding .ft { flex: 1; min-width: 250px; font-size: 15px; font-weight: 600; color: var(--ink); }
  .finding .fa { font-size: 13px; font-weight: 650; color: var(--accent); white-space: nowrap; }

  /* ---------- closing ---------- */
  .btn {
    display: inline-block; font-size: 14px; font-weight: 650; text-decoration: none;
    background: var(--accent); color: var(--on-accent); padding: 11px 20px; border-radius: 9px;
    white-space: nowrap;
  }
  .btn.ghost { background: transparent; color: var(--accent); border: 1.5px solid var(--accent); padding: 9.5px 18.5px; }
  .btn:hover { filter: brightness(1.06); }
  .close {
    margin-top: 80px; padding: 44px 32px; text-align: center;
    background: var(--panel); border: 1px solid var(--line-2); border-radius: 18px;
  }
  .close h2 { font-size: clamp(24px, 4vw, 34px); font-weight: 800; }
  .close p { color: var(--ink-soft); font-size: 16px; margin: 14px auto 24px; max-width: 54ch; }
  .close .btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  .close .note { font-size: 12.5px; color: var(--ink-faint); margin-top: 20px; }

  /* ---------- footer ---------- */
  footer { margin-top: 56px; padding-top: 26px; border-top: 1px solid var(--line); color: var(--ink-faint); font-size: 12.5px; line-height: 1.7; }
  footer .fine { margin: 0; max-width: 78ch; }
  footer a { color: var(--ink-soft); }

  /* ---------- badge rows: the one component only this page has ---------- */
  .badge-row {
    background: var(--panel); border: 1px solid var(--line-2); border-radius: 14px;
    padding: 18px 20px; margin-bottom: 14px; box-shadow: var(--shadow);
  }
  .badge-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
  .badge-img { display: block; }
  .badge-lib { font-size: 15.5px; font-weight: 720; letter-spacing: -.02em; color: var(--ink); }
  .badge-ver { font-family: var(--font-mono); font-size: 12px; font-weight: 400; color: var(--ink-faint); }
  .snip {
    margin: 0; background: var(--code-bg); border: 1px solid var(--line);
    border-radius: 10px; padding: 12px 14px; overflow-x: auto;
  }
  .snip code { font-size: 12px; color: var(--ink-soft); white-space: pre; }
</style>

<div class="wrap">

  <div class="mast">
    <span class="logo">SDK<b>Proof</b></span>
    <span class="navs">
      <a class="gh" href="index.html">All eight scores</a>
      <a class="gh" href="https://github.com/Kalpitrathore/sdkproof">Source on GitHub</a>
    </span>
  </div>

  <header class="hero">
    <span class="eyebrow">For maintainers</span>
    <h1>Put your score<br><span class="dim">in your README.</span></h1>
  </header>

  <div class="lede">
    <p>AI coding assistants write library code from memory. When a library ships a big release that renames or removes things, the assistant keeps writing the old version. It reads fine &amp; it doesn't build.</p>
    <p><b>SDKProof measures how often that happens.</b> It gives a model real coding jobs for one library, then compiles every answer against the real installed package with <code>tsc</code>, the TypeScript compiler. A task passes only if it compiles &mdash; no AI judges another AI.</p>
    <p>A badge publishes that number. One line of markdown, and <b>it reads the same run as the scorecard</b>, so it can't claim a number the page doesn't show.</p>
  </div>

  <section class="sec">
    <div class="head">
      <span class="eyebrow">Grab yours</span>
      <h2>Copy the line, paste it near the top of your README</h2>
      <p>Each badge links back to its full scorecard, so anyone reading it can check the number instead of taking it on faith.</p>
    </div>

${cards}
  </section>

  <section class="sec">
    <div class="head">
      <span class="eyebrow">Read this first</span>
      <h2>Three things the number does not mean</h2>
    </div>
    <dl class="limits">
      <div>
        <dt>The score can go down</dt>
        <dd>It is re-measured when a new model ships, and when your library ships a big release that removes or renames things. The badge follows the run — that is the whole point of it. A rename with no deprecation period will move your number, and I will not ask before it does.</dd>
      </div>
      <div>
        <dt>It measures the model, not your library</dt>
        <dd>A low score means today's assistants write an older version of your API from memory. That is usually a signal your newest major is too recent for the training data, which is not a defect in your code.</dd>
      </div>
      <div>
        <dt>It is one model on 10–15 tasks</dt>
        <dd>Every score on this site is Claude Opus 5, type-checked against the installed package. Passing means it compiles clean — which cannot catch code that compiles and means something else.</dd>
      </div>
    </dl>
  </section>

  <section class="sec">
    <div class="head">
      <span class="eyebrow">Prefer shields.io?</span>
      <h2>Every badge is also a shields endpoint</h2>
      <p>Same numbers, same source file, if you would rather your README pointed at shields than at my domain.</p>
    </div>
    <figure class="pane" style="max-width:660px">
      <figcaption>
        <span class="pl">shields.io endpoint</span>
        <code class="pv">swap the slug for yours</code>
      </figcaption>
      <div class="scroll"><pre><code>${esc(`![SDKProof](https://img.shields.io/endpoint?url=${SITE}/badge/zod.json)`)}</code></pre></div>
    </figure>
    <p class="cap">Every score is also published as JSON at <a href="scores.json">sdkproof.dev/scores.json</a>, with both rates and a 95% interval on each.</p>
  </section>

  <div class="close">
    <h2>Not scored yet?</h2>
    <p>Open an issue with your library &amp; I'll add it to the queue. React Router 8 is on the board because someone asked for it.</p>
    <div class="btns">
      <a class="btn" href="https://github.com/Kalpitrathore/sdkproof/issues/new?template=request-a-scorecard.yml">Request a scorecard →</a>
      <a class="btn ghost" href="https://github.com/Kalpitrathore/sdkproof">Read the code</a>
    </div>
    <p class="note">There's no npm package. Clone the repo, point it at a library, run it. The compiler is the judge.</p>
  </div>

  <footer>
    <p class="fine">SDKProof — independent measurement of how AI coding agents write real SDKs. Not affiliated with the libraries scored.</p>
  </footer>
</div>
`;

writeFileSync(path.join(root, "scorecards", "badge.html"), page);

const badged = rows.filter((r) => r.badge !== false).length;
console.log(
  `Built ${badged} badges (svg + shields json) into docs/badge/, plus docs/scores.json ` +
    `(${rows.length} libraries, both rates) and scorecards/badge.html`
);
