// Builds the static site in docs/ (for GitHub Pages) from the scorecard sources
// in scorecards/. Each source is a body-only fragment; this wraps it into a full
// HTML document and rewrites the Claude-artifact links to relative page links.
import { readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
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

const PAGES = ["index.html", "prisma7.html", "aisdk.html", "zod.html", "tanstack-query.html", "nextjs.html", "react-router.html", "privacy.html"];

const SITE = "https://sdkproof.dev";

// Per-page social + search metadata. `title` is the <title> already in the source;
// `social` is the Open Graph headline, which leads with the score because that is
// the thing worth clicking. `desc` is the meta description — every page used to
// share one generic string, which helps neither search nor previews.
const META = {
  "index.html": {
    social: "SDKProof — How ready is your SDK for AI coding agents?",
    desc: "How well do AI coding agents write your SDK's current API? Type-checked scorecards on Claude Opus 5 — the compiler decides, not an LLM judge.",
    type: "website",
  },
  "tanstack-query.html": {
    social: "TanStack Query v5 — 100/100 AI-readiness",
    desc: "TanStack Query v5 scores 100/100 for AI-readiness on Claude Opus 5. Every v4→v5 rename — gcTime, placeholderData, 'pending' — written unprompted.",
    type: "article",
  },
  "aisdk.html": {
    social: "Vercel AI SDK 7 — 100/100 AI-readiness",
    desc: "Vercel AI SDK 7 scores 100/100 on Claude Opus 5. The v7 tool rename (inputSchema, stopWhen) is fully absorbed — it was 90/100 on Opus 4.8.",
    type: "article",
  },
  "zod.html": {
    social: "Zod 4 — 100/100 AI-readiness",
    desc: "Zod 4 scores 100/100 on Claude Opus 5, writing the unified error option and 2-arg z.record() unprompted. It was 90/100 on Opus 4.8.",
    type: "article",
  },
  "nextjs.html": {
    social: "Next.js 16 — 92/100 AI-readiness",
    desc: "Next.js 16 scores 92/100 for AI-readiness on Claude Opus 5. Async cookies and headers are absorbed; the 2-arg revalidateTag is the one miss.",
    type: "article",
  },
  "prisma7.html": {
    social: "Prisma 7 — 87/100 AI-readiness",
    desc: "Prisma 7 scores 87/100 on Claude Opus 5. The queries and $extends are clean — every miss is client construction, like the required driver adapter.",
    type: "article",
  },
  "react-router.html": {
    social: "React Router 8 — 93/100 AI-readiness",
    desc: "React Router 8 scores 93/100 on Claude Opus 5. It drops json() and defer() unprompted; the one consistent miss is meta's removed data argument, now loaderData.",
    type: "article",
  },
  "privacy.html": {
    social: "SDKProof — Privacy",
    desc: "What SDKProof collects: no accounts, no forms. Cloudflare Web Analytics for cookieless counts, Microsoft Clarity for heatmaps and session replay.",
    type: "website",
  },
};

// Pages without a dedicated OG card fall back to the board image.
const OG_FALLBACK = new Set(["privacy.html"]);

const canonicalFor = (page) => (page === "index.html" ? `${SITE}/` : `${SITE}/${page}`);
const ogImageFor = (page) =>
  `${SITE}/og/${OG_FALLBACK.has(page) ? "index" : page.replace(/\.html$/, "")}.png`;
const attr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

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

  // Privacy link into every footer, injected here rather than added to six
  // separate fragments by hand.
  html = html.replace(
    "</footer>",
    '  <p class="fine" style="margin-top:10px"><a href="privacy.html">Privacy</a></p>\n  </footer>'
  );

  const title = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "SDKProof").trim();
  html = html.replace(/<title>[\s\S]*?<\/title>\s*/i, "");

  const meta = META[page];
  const canonical = canonicalFor(page);
  const ogImage = ogImageFor(page);

  // Organization carries the logo Google uses for the brand; WebSite only makes
  // sense once, on the home page.
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "SDKProof",
      url: `${SITE}/`,
      logo: `${SITE}/icon-512.png`,
      description:
        "Type-checked scorecards measuring how well AI coding agents write each SDK's current API.",
      sameAs: ["https://github.com/Kalpitrathore/sdkproof"],
    },
    ...(page === "index.html"
      ? [{ "@context": "https://schema.org", "@type": "WebSite", name: "SDKProof", url: `${SITE}/` }]
      : []),
  ];

  const doc = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="${attr(meta.desc)}">
<title>${title}</title>
<link rel="canonical" href="${canonical}">
<link rel="icon" type="image/svg+xml" href="favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<link rel="icon" type="image/png" sizes="48x48" href="favicon-48.png">
<link rel="icon" type="image/png" sizes="96x96" href="favicon-96.png">
<link rel="icon" type="image/png" sizes="192x192" href="favicon-192.png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta property="og:site_name" content="SDKProof">
<meta property="og:type" content="${meta.type}">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${attr(meta.social)}">
<meta property="og:description" content="${attr(meta.desc)}">
<meta property="og:image" content="${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${attr(meta.social)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${attr(meta.social)}">
<meta name="twitter:description" content="${attr(meta.desc)}">
<meta name="twitter:image" content="${ogImage}">
<script type="application/ld+json">${JSON.stringify(jsonLd.length === 1 ? jsonLd[0] : jsonLd)}</script>
<!-- Microsoft Clarity — heatmaps and session replay. Loaded in the document head so
     replay captures from first paint; Cloudflare Web Analytics stays at the end of
     the document and remains the source of truth for visitor counts. -->
<script type="text/javascript">
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "xtum7dy1n3");
</script>
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

// lastmod comes from each scorecard source's mtime, so it reflects when the page
// actually changed rather than when the build last ran.
const urls = PAGES.map((page) => {
  const mtime = statSync(path.join(root, "scorecards", page)).mtime;
  return `  <url>
    <loc>${canonicalFor(page)}</loc>
    <lastmod>${mtime.toISOString().slice(0, 10)}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${page === "index.html" ? "1.0" : page === "privacy.html" ? "0.3" : "0.8"}</priority>
  </url>`;
}).join("\n");

writeFileSync(
  path.join(root, "docs", "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
);

writeFileSync(
  path.join(root, "docs", "robots.txt"),
  `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`
);

console.log(`Built ${PAGES.length} pages into docs/ (+ .nojekyll, CNAME, sitemap.xml, robots.txt)`);
