// Builds the static site in docs/ (for GitHub Pages) from the scorecard sources
// in scorecards/. Each source is a body-only fragment; this wraps it into a full
// HTML document and rewrites the Claude-artifact links to relative page links.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// artifact id -> local page filename
const LINK_MAP = {
  "4df79bd2-d297-45b4-8a57-88e1a8f2f1f9": "prisma7.html",
  "c5e662ce-3971-42a4-a7bf-cc04a79c5c87": "aisdk.html",
  "1682ffa0-43df-4443-983b-98c1e57444ed": "zod.html",
  "11b4e801-b559-4e9b-805e-ddba0c1fb769": "index.html",
};

const PAGES = ["index.html", "prisma7.html", "aisdk.html", "zod.html"];

mkdirSync(path.join(root, "docs"), { recursive: true });

for (const page of PAGES) {
  let html = readFileSync(path.join(root, "scorecards", page), "utf8");

  for (const [id, file] of Object.entries(LINK_MAP)) {
    html = html.replaceAll(`https://claude.ai/code/artifact/${id}`, file);
  }

  // Inject the cat logo mark into the masthead, before the text wordmark.
  html = html.replace(
    '<span class="logo">SDK<b>Proof</b></span>',
    '<img src="favicon.svg" alt="" width="26" height="26" style="display:block;flex:none"><span class="logo">SDK<b>Proof</b></span>'
  );

  const title = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "SDKProof").trim();
  html = html.replace(/<title>[\s\S]*?<\/title>\s*/i, "");

  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="How ready is your SDK for AI coding agents? Type-checked scorecards from SDKProof.">
<title>${title}</title>
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<!-- DevHunt launch banner (temporary — remove after the launch week) -->
<script defer data-url="https://devhunt.org/tool/sdkproof" src="https://cdn.jsdelivr.net/gh/sidiDev/devhunt-banner/indexV0.js"></script>
</head>
<body>
${html.trim()}
<!-- Cloudflare Web Analytics -->
<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token": "a50cb1636e514225ad69b1f406df2054"}'></script>
<!-- End Cloudflare Web Analytics -->
</body>
</html>
`;
  writeFileSync(path.join(root, "docs", page), doc);
}

writeFileSync(path.join(root, "docs", ".nojekyll"), "");
// Custom domain for GitHub Pages — keep it here so a clean rebuild never drops it.
writeFileSync(path.join(root, "docs", "CNAME"), "sdkproof.dev\n");
console.log(`Built ${PAGES.length} pages into docs/ (+ .nojekyll, CNAME)`);
