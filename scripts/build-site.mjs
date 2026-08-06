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

const PAGES = ["index.html", "prisma7.html", "aisdk.html", "zod.html", "tanstack-query.html", "nextjs.html", "react-router.html", "stripe.html", "agent-docs.html", "badge.html", "privacy.html"];

const SITE = "https://sdkproof.dev";

// Per-page social + search metadata. `social` is the Open Graph headline, which
// leads with the score because that is the thing worth clicking. `desc` is the meta
// description — every page used to share one generic string, which helps neither
// search nor previews.
//
// `title` overrides the <title> in the source. Scorecard pages set it; index and
// privacy fall back to what the source already has. It mirrors each page's own H1
// and leads with the library, not the brand — "sdkproof" is the only query this
// site currently ranks for and the homepage already owns it, so spending the first
// eleven characters of six other titles defending it buys nothing. The score goes
// in because at position 7 the snippet is the only thing you control.
//
// Set 2026-07-31, reversing the 07-28 call to leave titles alone. That call was
// made to avoid disturbing what Google had indexed; the Search Console export
// showed five of six pages had never appeared in a result, so there was nothing
// to disturb and this is the cheapest moment to change them.
const META = {
  "index.html": {
    social: "SDKProof — How ready is your SDK for AI coding agents?",
    desc: "How well do AI coding agents write your SDK's current API? Type-checked scorecards on Claude Opus 5 — the compiler decides, not an LLM judge.",
    type: "website",
  },
  "tanstack-query.html": {
    title: "TanStack Query v5 is 100% ready for AI coding agents — SDKProof",
    social: "TanStack Query v5 — 100/100 AI-readiness",
    desc: "TanStack Query v5 scores 100/100 for AI-readiness on Claude Opus 5. Every v4→v5 rename — gcTime, placeholderData, 'pending' — written unprompted.",
    type: "article",
  },
  "aisdk.html": {
    title: "Vercel AI SDK 7 is 100% ready for AI coding agents — SDKProof",
    social: "Vercel AI SDK 7 — 100/100 AI-readiness",
    desc: "Vercel AI SDK 7 scores 100/100 on Claude Opus 5. The v7 tool rename (inputSchema, stopWhen) is fully absorbed — it was 90/100 on Opus 4.8.",
    type: "article",
  },
  "zod.html": {
    title: "Zod 4 is 100% ready for AI coding agents — SDKProof",
    social: "Zod 4 — 100/100 AI-readiness",
    desc: "Zod 4 scores 100/100 on Claude Opus 5, writing the unified error option and 2-arg z.record() unprompted. It was 90/100 on Opus 4.8.",
    type: "article",
  },
  "nextjs.html": {
    title: "Next.js 16 is 92% ready for AI coding agents — SDKProof",
    social: "Next.js 16 — 92/100 AI-readiness",
    desc: "Next.js 16 scores 92/100 for AI-readiness on Claude Opus 5. Async cookies and headers are absorbed; the 2-arg revalidateTag is the one miss.",
    type: "article",
  },
  "prisma7.html": {
    title: "Prisma 7 is 87% ready for AI coding agents — SDKProof",
    social: "Prisma 7 — 87/100 AI-readiness",
    desc: "Prisma 7 scores 87/100 on Claude Opus 5. The queries and $extends are clean — every miss is client construction, like the required driver adapter.",
    type: "article",
  },
  "react-router.html": {
    title: "React Router 8 is 93% ready for AI coding agents — SDKProof",
    social: "React Router 8 — 93/100 AI-readiness",
    desc: "React Router 8 scores 93/100 on Claude Opus 5. It drops json() and defer() unprompted; the one consistent miss is meta's removed data argument, now loaderData.",
    type: "article",
  },
  "stripe.html": {
    // No "N% ready" title here. A third of the task set produced no code, so a
    // flat readiness claim would overstate a narrower measurement than the other
    // five pages report.
    title: "Stripe 22 scores 100 on every AI task that ran — SDKProof",
    social: "Stripe 22 — 100% of answers correct, 67% of tasks answered",
    desc: "Claude Opus 5 writes Stripe 22's current API cleanly on all 10 tasks it would attempt, including the pinned apiVersion and Stripe.Decimal. It refused the other five outright, so the page publishes both rates.",
    type: "article",
  },
  "agent-docs.html": {
    title: "What libraries actually ship for AI coding agents — SDKProof",
    social: "Nine libraries publish docs for LLMs. Almost none of it is usable without fetching.",
    desc: "A survey of llms.txt and llms-full.txt across nine TypeScript libraries: same filename, a 2,500x spread in size, and no agreement on whether the file is documentation or a list of links to it.",
    type: "article",
  },
  "badge.html": {
    title: "SDKProof badges — put your AI-readiness score in your README",
    social: "Put your AI-readiness score in your README",
    desc: "Copy-paste README badges for every library SDKProof scores. The badge reads the same run as the scorecard, so it never claims a number the page doesn't show.",
    type: "website",
  },
  "privacy.html": {
    social: "SDKProof — Privacy",
    desc: "What SDKProof collects: no accounts, no forms. Cloudflare Web Analytics for cookieless counts, Microsoft Clarity for heatmaps and session replay.",
    type: "website",
  },
};

// Pages without a dedicated OG card fall back to the board image.
const OG_FALLBACK = new Set(["privacy.html", "badge.html", "agent-docs.html"]);

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

  // Inject the cat logo mark into the masthead, and make the wordmark a link home.
  // Clarity recorded dead clicks in 17.65% of sessions (2026-08-04) and the masthead
  // was the one confirmed source: people click a logo expecting to go home, and this
  // one was inert text on every page.
  html = html.replace(
    '<span class="logo">SDK<b>Proof</b></span>',
    '<a href="index.html" aria-label="SDKProof home" style="display:flex;align-items:center;gap:10px;text-decoration:none">' +
      '<img src="favicon.svg" alt="" width="26" height="26" style="display:block;flex:none">' +
      '<span class="logo">SDK<b>Proof</b></span>' +
    '</a>'
  );

  // Privacy link into every footer, injected here rather than added to six
  // separate fragments by hand.
  html = html.replace(
    "</footer>",
    '  <p class="fine" style="margin-top:10px"><a href="agent-docs.html">Agent-docs survey</a> · <a href="badge.html">README badge</a> · <a href="privacy.html">Privacy</a></p>\n  </footer>'
  );

  const sourceTitle = (html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? "SDKProof").trim();
  html = html.replace(/<title>[\s\S]*?<\/title>\s*/i, "");

  const meta = META[page];
  const title = meta.title ?? sourceTitle;
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
    <priority>${page === "index.html" ? "1.0" : page === "privacy.html" ? "0.3" : page === "badge.html" ? "0.6" : page === "agent-docs.html" ? "0.7" : "0.8"}</priority>
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
