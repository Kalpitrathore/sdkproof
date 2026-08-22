/**
 * Rasterises the mark and the lockup from their SVG sources.
 *
 * docs/favicon.svg and docs/logo.svg are the only hand-edited art in the repo;
 * everything below is derived from them, so the mark can be changed in one
 * place. build-og.mjs takes over from here — it makes favicon-48/96/192 and the
 * Open Graph cards from icon-512.png, which this writes.
 *
 *   node scripts/build-logo.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docs = path.join(root, "docs");

const markSvg = readFileSync(path.join(docs, "favicon.svg"));
const logoSvg = readFileSync(path.join(docs, "logo.svg"));

async function png(svg, size, file, opts = {}) {
  const img = sharp(svg, { density: 600 }).resize(size.w, size.h, {
    fit: "contain",
    background: opts.background ?? { r: 0, g: 0, b: 0, alpha: 0 },
  });
  await (opts.background ? img.flatten({ background: opts.background }) : img)
    .png({ compressionLevel: 9 })
    .toFile(path.join(docs, file));
  console.log(`  ${file.padEnd(28)} ${size.w}x${size.h}`);
}

// The square mark. icon-512 is the source every other size is cut from.
await png(markSvg, { w: 512, h: 512 }, "icon-512.png");
await png(markSvg, { w: 32, h: 32 }, "favicon-32.png");

// Home-screen icons are masked by the OS, so they get a full-bleed tile: the
// rounded corners come from iOS, and a transparent margin would show as a gap.
const bleed = Buffer.from(
  String(markSvg)
    .replace('<rect x="110" y="90" width="140" height="140" rx="34"', '<rect x="104" y="84" width="168" height="168" rx="0"')
    .replace('<path d="M110 125 H250"', '<path d="M104 125 H272"'),
);
await png(bleed, { w: 180, h: 180 }, "apple-touch-icon.png", { background: { r: 14, g: 18, b: 22 } });

// The lockup goes through a browser rather than through sharp: the wordmark is
// live text in the site's own font stack, and librsvg resolves that stack
// differently from the page it has to match.
const lockupHtml = `<!doctype html><meta charset="utf-8"><style>
  html, body { margin: 0; background: transparent; }
  .frame { width: 1360px; height: 680px; padding: 40px; box-sizing: border-box; }
  .card {
    width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
    gap: 54px; background: #f7f8f7; border-radius: 52px; box-sizing: border-box;
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  }
  /* The rule underlines "proof" and nothing else, the way the wordmark has
     always been drawn. A block rule would run the width of the column. */
  .word { font-size: 168px; line-height: 1; letter-spacing: -.035em; color: #0e1216; padding-bottom: 30px; }
  .word .a { font-weight: 400; }
  .word .b { font-weight: 800; border-bottom: 20px solid #0a7f74; padding-bottom: 26px; }
</style>
<div class="frame"><div class="card">
  ${String(markSvg).replace('width="512" height="512"', 'width="340" height="340"')}
  <div class="word"><span class="a">sdk</span><span class="b">proof</span></div>
</div></div>`;

const tmp = path.join(root, "docs", ".logo-lockup.html");
writeFileSync(tmp, lockupHtml);
const chrome = process.env.CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
try {
  execFileSync(chrome, [
    "--headless", "--disable-gpu", "--hide-scrollbars",
    "--default-background-color=00000000",
    "--force-device-scale-factor=1",
    `--screenshot=${path.join(docs, "logo.png")}`,
    "--window-size=1360,680",
    "--virtual-time-budget=2000",
    `file://${tmp}`,
  ], { stdio: "ignore" });
  console.log(`  ${"logo.png".padEnd(28)} 1360x680`);
} catch {
  console.error("  logo.png SKIPPED - set CHROME to a Chrome binary to cut the lockup");
} finally {
  rmSync(tmp, { force: true });
}

console.log("\nNow run `npm run build:og` to cut favicon-48/96/192 and the OG cards.");
