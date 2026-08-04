// Pushes the site's URLs to IndexNow, which Bing, Yandex, Seznam and Naver all read
// from one endpoint. Google does not participate.
//
// Why bother: Search Console took a week to produce a Pages report and Bing asks for
// 48 hours before it will show anything. Waiting to be crawled is the slowest part of
// publishing a scorecard, and IndexNow replaces it with a request. Measured on
// 2026-08-04, Bing was already sending 5× the referrals Google was, so its index is
// the one worth keeping current.
//
// Usage:
//   node scripts/submit-indexnow.mjs                  # every URL in the sitemap
//   node scripts/submit-indexnow.mjs stripe.html      # just the pages you name
//
// The key is public by design: ownership is proved by serving it at
// https://sdkproof.dev/<key>.txt, which is committed in docs/. Nothing here is secret.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const HOST = "sdkproof.dev";
const KEY = "003a55f35ade8bfc32d04b91dc404707";
const ENDPOINT = "https://api.indexnow.org/indexnow";

const args = process.argv.slice(2);

// Default to whatever the sitemap says is public, so this can never drift from the
// site the way a second hardcoded page list would.
function urlsFromSitemap() {
  const xml = readFileSync(path.join(root, "docs", "sitemap.xml"), "utf8");
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

const urlList = args.length
  ? args.map((a) => (a.startsWith("http") ? a : `https://${HOST}/${a.replace(/^\//, "")}`))
  : urlsFromSitemap();

if (!urlList.length) {
  console.error("no URLs to submit");
  process.exit(1);
}

const body = {
  host: HOST,
  key: KEY,
  keyLocation: `https://${HOST}/${KEY}.txt`,
  urlList,
};

// Fail loudly on a missing key file rather than letting the endpoint reject the batch
// with a 403 that reads like a network problem.
const keyUrl = body.keyLocation;
const keyRes = await fetch(keyUrl).catch(() => null);
if (!keyRes?.ok) {
  console.error(`key file not reachable at ${keyUrl} — deploy docs/ first`);
  process.exit(1);
}
const served = (await keyRes.text()).trim();
if (served !== KEY) {
  console.error(`key file at ${keyUrl} contains "${served}", expected "${KEY}"`);
  process.exit(1);
}

const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify(body),
});

// 200 = accepted, 202 = accepted but the key is still being validated. Both are fine.
console.log(`${res.status} ${res.statusText} — submitted ${urlList.length} URL(s)`);
for (const u of urlList) console.log(`  ${u}`);
if (!res.ok && res.status !== 202) {
  console.error(await res.text());
  process.exit(1);
}
