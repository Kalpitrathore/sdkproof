/**
 * Emits docs/drift.json — the verbatim output of `npx sdkproof drift <pkg>` for
 * the packages on the board, so the homepage terminal replays real output
 * instead of an illustration of it.
 *
 * The CLI is run for real and its stdout captured; nothing here is written by
 * hand. The only edit is length: a symbol list is capped and the cut is marked
 * with its own count, the same way the CLI caps its own list at 40.
 *
 *   node scripts/build-drift-demo.mjs
 */
import { execFile } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(root, "packages", "cli", "dist", "cli.js");

if (!existsSync(CLI)) {
  console.error(`missing ${CLI} - run \`npm run build:cli\` first`);
  process.exit(1);
}

// The eight board packages, in board order, plus Apollo: its v4 is the clearest
// case of a removal that is really a move, and it is the finding the site
// already explains at length.
const PACKAGES = [
  "@tanstack/react-table",
  "ai",
  "@prisma/client",
  "next",
  "react-router",
  "stripe",
  "@tanstack/react-query",
  "zod",
  "@apollo/client",
];

/** How many symbols of a list to show before collapsing the rest into a count. */
const KEEP = 6;
const MARKER = "\u0000sdkproof-cut\u0000";

const isSymbolLine = (line) => /^ {4}\S/.test(line) && !/^ {4}(\.\.\.|Next:)/.test(line);

/**
 * Cap each run of symbol lines at KEEP, replacing the rest with a counted
 * marker. Everything else is passed through untouched.
 */
function trim(out) {
  const lines = out.replace(/\s+$/, "").split("\n");
  const kept = [];
  const counts = [];
  let run = 0;
  for (const line of lines) {
    if (!isSymbolLine(line)) {
      if (run > KEEP) counts.push(run);
      run = 0;
      kept.push(line);
      continue;
    }
    run++;
    if (run <= KEEP) kept.push(line);
    else if (run === KEEP + 1) kept.push(MARKER);
  }
  if (run > KEEP) counts.push(run);

  let i = 0;
  return kept
    .map((line) => (line === MARKER ? `    ... ${counts[i++] - KEEP} more` : line))
    .join("\n");
}

const runs = {};
for (const pkg of PACKAGES) {
  const { stdout, stderr } = await exec(process.execPath, [CLI, "drift", pkg], {
    maxBuffer: 16 * 1024 * 1024,
  }).catch((e) => ({ stdout: e.stdout ?? "", stderr: e.stderr ?? "" }));
  const text = (stdout || stderr).replace(/^\n+/, "");
  if (!text.trim()) {
    console.error(`  ${pkg}: no output, skipped`);
    continue;
  }
  runs[pkg] = trim(text);
  const verdict = /NOT WORTH SCORING|CANNOT READ THIS PACKAGE|WORTH SCORING/.exec(text);
  console.log(`  ${pkg.padEnd(24)} ${verdict ? verdict[0] : "?"}`);
}

const cliPkg = JSON.parse(readFileSync(path.join(root, "packages", "cli", "package.json"), "utf8"));

const payload = {
  generatedAt: new Date().toISOString().slice(0, 10),
  cliVersion: cliPkg.version,
  note: "Verbatim stdout of `npx sdkproof drift <package>`. Long symbol lists are cut, and the cut is counted.",
  runs,
};

writeFileSync(path.join(root, "docs", "drift.json"), JSON.stringify(payload, null, 2));
console.log(`\ndocs/drift.json - ${Object.keys(runs).length} packages, sdkproof ${cliPkg.version}`);

// The homepage ships one run inline so the panel is complete without
// JavaScript, and the README quotes the same one. Both are rewritten here
// rather than by hand: they went stale within a day of being written, and a
// stale sample on a page whose argument is "this is real output" is the worst
// kind of wrong.
const SAMPLE = "@apollo/client";
const sample = runs[SAMPLE];
if (sample) {
  rewrite(path.join(root, "README.md"), "<!-- drift:@apollo/client -->", "<!-- /drift -->", "\n```\n" + sample + "\n```\n");
  rewrite(path.join(root, "scorecards", "index.html"), "<!--drift-->", "<!--/drift-->", renderLines(sample));
  console.log("rewrote the inline sample in README.md and scorecards/index.html");
}

function rewrite(file, open, close, body) {
  const src = readFileSync(file, "utf8");
  const a = src.indexOf(open);
  const b = src.indexOf(close, a);
  if (a < 0 || b < 0) throw new Error(`markers not found in ${file}`);
  writeFileSync(file, src.slice(0, a + open.length) + body + src.slice(b));
}

function escapeHtml(v) {
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Same classes the page's own script applies, so the fallback matches a live run. */
function lineClass(line) {
  if (line.trim() && /^\u2500+$/.test(line.trim())) return "rule";
  if (/^ {2}NOT WORTH SCORING/.test(line) || /^ {2}CANNOT READ/.test(line)) return "stop";
  if (/^ {2}WORTH SCORING/.test(line)) return "good";
  if (/^ {2}WHAT LEFT/.test(line)) return "what";
  if (/^ {2}Next:/.test(line)) return "next";
  if (/^ {4}\.\.\./.test(line)) return "dim";
  if (/^ {4}\S/.test(line)) return "sym";
  if (/^ {2}\(/.test(line)) return "dim";
  if (/^ {2}\S.*\sv[\d.]+ -> v[\d.]+/.test(line)) return "head";
  return "";
}

function renderLines(text) {
  return text
    .split("\n")
    .map((l) => {
      const c = lineClass(l);
      return `<span class="l${c ? " " + c : ""}">${escapeHtml(l) || "&nbsp;"}</span>`;
    })
    .join("\n");
}
