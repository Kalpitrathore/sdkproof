// Generates the Open Graph / Twitter card images in docs/og/ — one per page, with
// the SDK's actual score baked in. A link preview reading "Prisma 7 — 87/100" earns
// far more clicks than a generic logo, and these are what every shared link renders.
//
// Run via `npm run build:og` (or build:site, which calls it). Output is committed,
// so this only needs re-running when a score changes.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs", "og");
mkdirSync(outDir, { recursive: true });

const W = 1200;
const H = 630;

// Brand tokens, lifted from the site's dark theme so the card matches the page it opens.
const BG = "#0b0f14";
const PANEL = "#11171e";
const LINE = "#222c37";
const INK = "#e6edf3";
const INK_SOFT = "#a3b0bd";
const INK_FAINT = "#6b7784";
const BRAND = "#2dd4bf";
const PASS = "#3fb950";
const WARN = "#d29922";

const SANS = "Helvetica Neue, Helvetica, Arial, sans-serif";
const MONO = "Menlo, Monaco, monospace";

const scoreColor = (n) => (n >= 95 ? PASS : n >= 90 ? BRAND : WARN);

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Shared chrome: background, hairline frame, wordmark, footer rule.
const shell = (inner, footer) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect x="0" y="0" width="${W}" height="6" fill="${BRAND}"/>
  <rect x="56" y="56" width="${W - 112}" height="${H - 112}" rx="18" fill="${PANEL}" stroke="${LINE}" stroke-width="1.5"/>
  <text x="176" y="130" font-family="${SANS}" font-size="30" font-weight="700" fill="${INK}">SDK<tspan fill="${BRAND}">Proof</tspan></text>
  ${inner}
  <line x1="104" y1="${H - 128}" x2="${W - 104}" y2="${H - 128}" stroke="${LINE}" stroke-width="1.5"/>
  <text x="104" y="${H - 88}" font-family="${MONO}" font-size="21" fill="${INK_FAINT}">${esc(footer)}</text>
  <text x="${W - 104}" y="${H - 88}" text-anchor="end" font-family="${MONO}" font-size="21" fill="${BRAND}">sdkproof.dev</text>
</svg>`;

// Shrink the SDK name to fit its column so a long one ("TanStack Query v5") can't
// collide with the score. Helvetica Bold averages ~0.58em of advance per character;
// that estimate is coarse but only ever errs toward a slightly smaller name.
const NAME_MAX_WIDTH = 640;
function fitFont(text, maxWidth = NAME_MAX_WIDTH, maxSize = 76) {
  return Math.min(maxSize, Math.floor(maxWidth / (text.length * 0.58)));
}

// A scorecard page: SDK name on the left, the number set large on the right.
function scorecardSvg({ name, score, passed, total, note }) {
  const col = scoreColor(score);
  return shell(
    `
  <text x="104" y="268" font-family="${SANS}" font-size="${fitFont(name)}" font-weight="700" fill="${INK}">${esc(name)}</text>
  <text x="104" y="322" font-family="${SANS}" font-size="30" font-weight="500" fill="${INK_SOFT}">AI-Readiness Scorecard</text>
  <text x="104" y="392" font-family="${SANS}" font-size="26" fill="${INK_FAINT}">${esc(note)}</text>

  <text x="${W - 104}" y="300" text-anchor="end" font-family="${MONO}" font-size="168" font-weight="700" fill="${col}">${score}</text>
  <text x="${W - 104}" y="352" text-anchor="end" font-family="${MONO}" font-size="30" fill="${INK_FAINT}">/100 · ${passed}/${total} tasks</text>
`,
    "Claude Opus 5 · type-checked, no LLM judge"
  );
}

// The board page: the headline plus every score, so the preview shows the whole thesis.
function boardSvg(rows) {
  const cells = rows
    .map((r, i) => {
      const x = 104 + i * 200;
      return `
  <text x="${x}" y="446" font-family="${MONO}" font-size="60" font-weight="700" fill="${scoreColor(r.score)}">${r.score}</text>
  <text x="${x}" y="482" font-family="${SANS}" font-size="20" fill="${INK_FAINT}">${esc(r.short)}</text>`;
    })
    .join("");

  return shell(
    `
  <text x="104" y="252" font-family="${SANS}" font-size="62" font-weight="700" fill="${INK}">How ready is your SDK</text>
  <text x="104" y="326" font-family="${SANS}" font-size="62" font-weight="700" fill="${INK}">for AI coding <tspan fill="${BRAND}">agents</tspan>?</text>
  <line x1="104" y1="378" x2="${W - 104}" y2="378" stroke="${LINE}" stroke-width="1.5"/>
  ${cells}
`,
    "Type-checked against the real installed package"
  );
}

const PAGES = {
  "index.png": boardSvg([
    { short: "TanStack Q", score: 100 },
    { short: "Vercel AI", score: 100 },
    { short: "Zod 4", score: 100 },
    { short: "React Router", score: 93 },
    { short: "Next.js 16", score: 92 },
    { short: "Stripe 22", score: 100 },
    { short: "Prisma 7", score: 87 },
  ]),
  "tanstack-query.png": scorecardSvg({
    name: "TanStack Query v5",
    score: 100,
    passed: 13,
    total: 13,
    note: "Every v4→v5 rename navigated unprompted",
  }),
  "aisdk.png": scorecardSvg({
    name: "Vercel AI SDK 7",
    score: 71,
    passed: 10,
    total: 14,
    note: "v7 removed the callback types — inline still infers",
  }),
  "zod.png": scorecardSvg({
    name: "Zod 4",
    score: 100,
    passed: 10,
    total: 10,
    note: "Was 90 on Opus 4.8 — writes the unified error option",
  }),
  "nextjs.png": scorecardSvg({
    name: "Next.js 16",
    score: 92,
    passed: 12,
    total: 13,
    note: "Only consistent miss: the 2-arg revalidateTag",
  }),
  "react-router.png": scorecardSvg({
    name: "React Router 8",
    score: 93,
    passed: 14,
    total: 15,
    note: "Only consistent miss: meta's data arg, now loaderData",
  }),
  "stripe.png": scorecardSvg({
    name: "Stripe 22",
    score: 100,
    passed: 10,
    total: 10,
    note: "100% conditional, 67% unconditional — 5 of 15 refused",
  }),
  "prisma7.png": scorecardSvg({
    name: "Prisma 7",
    score: 87,
    passed: 13,
    total: 15,
    note: "Every miss is client construction, not queries",
  }),
};

// The cat mark, composited in rather than inlined — librsvg won't nest an external SVG.
const mark = await sharp(path.join(root, "docs", "icon-512.png"))
  .resize(56, 56, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

for (const [file, svg] of Object.entries(PAGES)) {
  await sharp(Buffer.from(svg))
    .composite([{ input: mark, top: 84, left: 104 }])
    .png({ compressionLevel: 9 })
    .toFile(path.join(outDir, file));
}

console.log(`Built ${Object.keys(PAGES).length} OG images into docs/og/`);

// Favicons: Google wants a square that is a multiple of 48px, and the site only
// shipped a 32×32 — which is why no icon shows next to the search result.
const src = path.join(root, "docs", "icon-512.png");
for (const size of [48, 96, 192]) {
  await sharp(src)
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(path.join(root, "docs", `favicon-${size}.png`));
}
console.log("Built favicon-48 / -96 / -192.png");
