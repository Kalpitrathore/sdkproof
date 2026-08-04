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

const rows = LIBS.map((lib) => {
  const result = JSON.parse(readFileSync(path.join(root, "data", `${lib.slug}.result.json`), "utf8"));
  const model = result.perModel?.[0] ?? {};
  const score = result.overallScore;
  const message = `${score}/100`;
  const color = colorFor(score);

  const badge = badgeSvg({ slug: lib.slug, message, color });
  writeFileSync(path.join(outDir, `${lib.slug}.svg`), badge.svg);

  // shields.io endpoint, for maintainers who would rather point at shields than at
  // a stranger's domain. Same numbers, same source file.
  writeFileSync(
    path.join(outDir, `${lib.slug}.json`),
    JSON.stringify({ schemaVersion: 1, label: LABEL, message, color }) + "\n"
  );

  return {
    ...lib,
    score,
    message,
    badgeWidth: badge.width,
    version: result.libraryVersion,
    passed: model.passed,
    total: model.total,
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
      scores: rows.map((r) => ({
        library: r.name,
        slug: r.slug,
        libraryVersion: r.version,
        model: r.model,
        score: r.score,
        passed: r.passed,
        total: r.total,
        scorecard: `${SITE}/${r.page}`,
        badge: `${SITE}/badge/${r.slug}.svg`,
      })),
    },
    null,
    2
  ) + "\n"
);

const snippet = (r) =>
  `[![${LABEL}: ${r.message}](${SITE}/badge/${r.slug}.svg)](${SITE}/${r.page}?ref=badge)`;

const cards = rows
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
  :root {
    --bg: #f6f8fa; --panel: #ffffff; --panel-2: #f0f3f6; --ink: #10151b;
    --ink-soft: #4a5560; --ink-faint: #7b8794; --line: #e2e8ee; --line-strong: #d3dbe3;
    --brand: #0e9aa7; --brand-ink: #ffffff;
    --font-body: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    --font-mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, "Cascadia Code", "Roboto Mono", monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0b0f14; --panel: #11171e; --panel-2: #161d26; --ink: #e6edf3;
      --ink-soft: #a3b0bd; --ink-faint: #6b7784; --line: #222c37; --line-strong: #2d3946;
      --brand: #2dd4bf; --brand-ink: #06231f;
    }
  }
  :root[data-theme="light"] {
    --bg: #f6f8fa; --panel: #ffffff; --panel-2: #f0f3f6; --ink: #10151b;
    --ink-soft: #4a5560; --ink-faint: #7b8794; --line: #e2e8ee; --line-strong: #d3dbe3;
    --brand: #0e9aa7; --brand-ink: #ffffff;
  }
  :root[data-theme="dark"] {
    --bg: #0b0f14; --panel: #11171e; --panel-2: #161d26; --ink: #e6edf3;
    --ink-soft: #a3b0bd; --ink-faint: #6b7784; --line: #222c37; --line-strong: #2d3946;
    --brand: #2dd4bf; --brand-ink: #06231f;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font-family: var(--font-body); line-height: 1.6; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; }
  .wrap { max-width: 880px; margin: 0 auto; padding: 0 20px 90px; }
  h1, h2 { text-wrap: balance; letter-spacing: -.015em; line-height: 1.12; margin: 0; }
  code { font-family: var(--font-mono); font-size: .92em; }
  a { color: var(--brand); }
  .eyebrow { font-family: var(--font-mono); font-size: 11.5px; letter-spacing: .16em; text-transform: uppercase; color: var(--ink-faint); font-weight: 600; }

  .mast { display: flex; align-items: center; gap: 10px; padding: 26px 0 0; }
  .logo { font-family: var(--font-mono); font-weight: 700; font-size: 15px; letter-spacing: -.02em; color: var(--ink); }
  .logo b { color: var(--brand); }
  .mast .gh { margin-left: auto; font-family: var(--font-mono); font-size: 12px; color: var(--ink-faint); text-decoration: none; border: 1px solid var(--line-strong); border-radius: 999px; padding: 4px 11px; }

  .hero { padding: 40px 0 30px; border-bottom: 1px solid var(--line-strong); margin-bottom: 34px; }
  .hero h1 { font-size: clamp(28px, 5vw, 44px); font-weight: 800; }
  .hero .sub { color: var(--ink-soft); font-size: 17px; margin: 14px 0 0; max-width: 62ch; }

  .doc h2 { font-size: 19px; font-weight: 700; margin: 34px 0 10px; }
  .doc p { color: var(--ink-soft); margin: 0 0 12px; max-width: 68ch; }
  .doc ul { color: var(--ink-soft); margin: 0 0 12px; padding-left: 20px; max-width: 68ch; }
  .doc li { margin-bottom: 7px; }
  .doc b { color: var(--ink); }

  .badge-row { border: 1px solid var(--line); border-radius: 12px; background: var(--panel); padding: 14px 16px; margin-bottom: 12px; }
  .badge-head { display: flex; align-items: center; gap: 11px; flex-wrap: wrap; margin-bottom: 10px; }
  .badge-img { display: block; }
  .badge-lib { font-weight: 650; font-size: 15px; }
  .badge-ver { font-family: var(--font-mono); font-size: 12px; font-weight: 400; color: var(--ink-faint); }
  .snip { margin: 0; background: var(--panel-2); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; overflow-x: auto; }
  .snip code { font-size: 12px; color: var(--ink-soft); white-space: pre; }

  .note { border-left: 3px solid var(--brand); background: var(--panel-2); border-radius: 0 8px 8px 0; padding: 12px 16px; margin: 0 0 12px; }
  .note p { margin: 0 0 8px; }
  .note p:last-child { margin-bottom: 0; }

  footer { margin-top: 48px; padding-top: 22px; border-top: 1px solid var(--line); color: var(--ink-faint); font-size: 12px; font-family: var(--font-mono); line-height: 1.7; }
  footer .fine { margin: 0; }
</style>

<div class="wrap">
  <div class="mast">
    <span class="logo">SDK<b>Proof</b></span>
    <a class="gh" href="https://github.com/Kalpitrathore/sdkproof">GitHub ↗</a>
  </div>

  <header class="hero">
    <div class="eyebrow">For maintainers</div>
    <h1>Put your AI-readiness score in your README.</h1>
    <p class="sub">One line of markdown. The badge reads from the same run as the scorecard, so it never claims a number the page doesn't show.</p>
  </header>

  <div class="doc">
    <h2>Grab yours</h2>
    <p>Copy the line, paste it near the top of your README. The badge links back to the full scorecard, so anyone can check the number rather than take it on faith.</p>

${cards}

    <h2>Read this before you embed it</h2>
    <div class="note">
      <p><b>The score can go down.</b> It is re-measured when a new model ships or your library ships a breaking major, and the badge follows the run — that is the whole point of it. A rename with no deprecation period will move your number, and I will not ask before it does.</p>
      <p><b>It measures the model, not your library.</b> A low score means today's assistants write an older version of your API from memory. That is usually a signal your newest major is too recent for the training data, which is not a defect in your code.</p>
      <p><b>It is one model on 10–15 tasks.</b> Every score on this site is Claude Opus 5, type-checked against the installed package. Passing means it compiles clean — which cannot catch code that compiles and means something else.</p>
    </div>

    <h2>Prefer shields.io?</h2>
    <p>Every badge is also published as a shields endpoint, if you would rather your README pointed at shields than at my domain. Same numbers, same source file.</p>
    <pre class="snip"><code>${esc(`![SDKProof](https://img.shields.io/endpoint?url=${SITE}/badge/zod.json)`)}</code></pre>

    <h2>Not scored yet?</h2>
    <p>Open an issue at <a href="https://github.com/Kalpitrathore/sdkproof/issues/new">github.com/Kalpitrathore/sdkproof</a> with your library and I'll add it to the queue. React Router 8 is on the board because someone asked for it.</p>
    <p>All scores are also available as JSON at <a href="scores.json">sdkproof.dev/scores.json</a>.</p>
  </div>

  <footer>
    <p class="fine">SDKProof — independent analysis of how AI coding agents use real SDKs. Not affiliated with the libraries scored.</p>
  </footer>
</div>
`;

writeFileSync(path.join(root, "scorecards", "badge.html"), page);

console.log(
  `Built ${rows.length} badges (svg + shields json) into docs/badge/, plus docs/scores.json and scorecards/badge.html`
);
