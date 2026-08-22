import type { Result, Verdict } from "./core/types.ts";
import { fmtInterval, rates } from "./core/stats.ts";
import type { TaskSet } from "./tasks.ts";
import { headlineRemovals, headlineSource, type DriftReport } from "./drift.ts";

export interface RunContext {
  packageName: string;
  version: string;
  taskSet: TaskSet;
  drift?: DriftReport;
  /** modules installed on top of the target to make it type-check */
  extraInstalls: string[];
}

const BAR = "─".repeat(60);

function firstLibraryError(v: Verdict) {
  return v.errors.find((e) => e.libraryRelated) ?? v.errors[0];
}

/**
 * What the run found, for a terminal.
 *
 * Findings lead and the score follows, because the score is the part nobody
 * acts on. Across this project's own distribution, findings pages drew ~10x the
 * traffic of scorecards and no one has ever written in about a number.
 */
export function renderTerminal(r: Result, ctx: RunContext): string {
  const out: string[] = [];
  const failed = r.verdicts.filter((v) => !v.passed);

  const passed = r.verdicts.filter((v) => v.passed).length;
  out.push("");
  out.push(BAR);
  // Counts, not a percentage. "0 of 3 compiled" is a claim a reader can check;
  // "0/100" reads as a grade the tool handed out, and a bare percentage hides
  // how small the denominator is.
  out.push(`  ${ctx.packageName}@${ctx.version} — ${passed} of ${r.verdicts.length} answers compiled`);
  out.push(BAR);

  if (r.lost?.length) {
    const ids = [...new Set(r.lost.map((l) => l.taskId))].join(", ");
    out.push("");
    out.push(`  INCOMPLETE RUN — ${r.lost.length} task(s) never generated: ${ids}`);
    out.push("  These are not refusals; the request never landed. The denominator");
    out.push("  below is smaller than the task set, so do not publish this number.");
  }

  out.push("");
  for (const m of r.perModel) {
    const refused = r.refusals.filter((x) => x.model === m.model).length;
    const s = rates({ passed: m.passed, scored: m.total, refused });
    out.push(
      `  ${m.model.padEnd(24)} ${String(m.passed).padStart(2)}/${String(m.total).padEnd(3)} ` +
        `compiled  (${s.conditional.pct}%, 95% CI ${fmtInterval(s.conditional.ci)})`,
    );
    if (refused) {
      out.push(
        `  ${" ".repeat(24)} ${refused} refused — unmeasured, not drift; ` +
          `${s.unconditional.pct}% of everything asked`,
      );
    }
  }

  if (failed.length) {
    out.push("");
    out.push("  WHAT BROKE");
    out.push("");
    for (const v of failed) {
      const e = firstLibraryError(v);
      const task = ctx.taskSet.tasks.find((t) => t.id === v.taskId);
      out.push(`  ${v.taskId}${task ? `  (${task.area}, ${task.difficulty})` : ""}`);
      if (e) out.push(`    ${e.code}: ${truncate(e.message, 140)}`);
      const extra = v.errors.length - 1;
      if (extra > 0) out.push(`    +${extra} more diagnostic${extra === 1 ? "" : "s"}`);
      out.push("");
    }
  } else {
    out.push("");
    out.push("  Every candidate compiled. Nothing drifted on this task set.");
    out.push("");
  }

  if (r.failurePatterns.length) {
    out.push("  FAILURE PATTERNS");
    for (const p of r.failurePatterns) {
      out.push(`    ${p.category.padEnd(24)} ${p.count}x`);
    }
    out.push("");
  }

  const headline = ctx.drift?.readable ? headlineRemovals(ctx.drift) : [];
  if (ctx.drift && headline.length) {
    const d = ctx.drift;
    out.push(
      `  DRIFT SURFACE  v${d.from.major} -> v${d.to.major}: ` +
        `${headline.length} ${headlineSource(d)}`,
    );
    out.push(`    ${headline.slice(0, 12).map(symbolLabel).join(", ")}${headline.length > 12 ? " ..." : ""}`);
    out.push("");
  }

  if (ctx.taskSet.rejected.length) {
    out.push(`  ${ctx.taskSet.rejected.length} synthesized task(s) rejected before the run:`);
    for (const x of ctx.taskSet.rejected.slice(0, 5)) out.push(`    ${x.id}: ${x.reason}`);
    out.push("");
  }

  out.push("  Pass means it compiled against the real installed package.");
  out.push("  No model judged another model; tsc decided.");
  out.push("");
  return out.join("\n");
}

/** `default` is a real removed export (zustand v5 dropped it) but reads as a typo. */
function symbolLabel(s: string): string {
  return s === "default" ? "default export" : s;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

/** The same run as a markdown report, for pasting into an issue or a thread. */
export function renderMarkdown(r: Result, ctx: RunContext): string {
  const lines: string[] = [];
  const failed = r.verdicts.filter((v) => !v.passed);

  lines.push(`# ${ctx.packageName} v${ctx.version} — SDKProof run`);
  lines.push("");
  lines.push(`**Generated:** ${r.generatedAt}  `);
  lines.push(`**Method:** every answer is type-checked against the real installed package with \`tsc\`. Pass = it compiles. No model judges another model.  `);
  lines.push(`**Tasks:** ${ctx.taskSet.tasks.length} (${ctx.taskSet.source === "synthesized" ? "written from the package README at this version" : ctx.taskSet.source})`);
  lines.push("");

  if (r.lost?.length) {
    lines.push(
      `> **Incomplete run — ${r.lost.length} task(s) never generated** (${[...new Set(r.lost.map((l) => l.taskId))].join(", ")}). ` +
        `Not refusals: generation errored before any code existed, so the denominator is smaller than the task set. ` +
        `A partial run that loses the hardest tasks scores higher than the real one — do not publish this number.`,
    );
    lines.push("");
  }

  lines.push(`## ${r.verdicts.filter((v) => v.passed).length} of ${r.verdicts.length} answers compiled`);
  lines.push("");
  lines.push(
    "**Conditional API correctness** = passes / completions that produced code. " +
      "**Unconditional task success** = passes / every task asked, refusals included. " +
      "Ranges are Wilson 95% intervals.",
  );
  lines.push("");
  lines.push("| Model | Conditional | Unconditional | Passed | Scored | Refused |");
  lines.push("|---|---:|---:|---:|---:|---:|");
  for (const m of r.perModel) {
    const refused = r.refusals.filter((x) => x.model === m.model).length;
    const s = rates({ passed: m.passed, scored: m.total, refused });
    lines.push(
      `| ${m.model} | ${s.conditional.pct}% (${fmtInterval(s.conditional.ci)}) | ` +
        `${s.unconditional.pct}% (${fmtInterval(s.unconditional.ci)}) | ${m.passed} | ${m.total} | ${refused || "—"} |`,
    );
  }
  lines.push("");

  if (failed.length) {
    lines.push("## What broke");
    lines.push("");
    for (const v of failed) {
      const task = ctx.taskSet.tasks.find((t) => t.id === v.taskId);
      lines.push(`### \`${v.taskId}\`${task ? ` — ${task.area}, ${task.difficulty}` : ""}`);
      lines.push("");
      if (task) {
        lines.push(`> ${task.prompt}`);
        lines.push("");
      }
      lines.push("```");
      for (const e of v.errors.slice(0, 8)) {
        lines.push(`${e.line}:${e.column}  error ${e.code}: ${e.message}`);
      }
      if (v.errors.length > 8) lines.push(`… ${v.errors.length - 8} more`);
      lines.push("```");
      lines.push("");
    }
  } else {
    lines.push("Every candidate compiled. Nothing on this task set drifted.");
    lines.push("");
  }

  if (r.failurePatterns.length) {
    lines.push("## Failure patterns");
    lines.push("");
    lines.push("| Category | Count | Example |");
    lines.push("|---|---:|---|");
    for (const p of r.failurePatterns) {
      lines.push(`| ${p.category} | ${p.count} | \`${p.example.taskId}\`: ${p.example.message.replace(/\|/g, "\\|").slice(0, 120)} |`);
    }
    lines.push("");
  }

  if (ctx.drift?.readable) {
    const d = ctx.drift;
    lines.push(`## Drift surface — v${d.from.major} → v${d.to.major}`);
    lines.push("");
    const shown = headlineRemovals(d);
    lines.push(
      `Comparing \`${d.from.version}\` with \`${d.to.version}\`: ${shown.length} ${headlineSource(d)}. ` +
        `(${d.removedFromEntry.length} left the entrypoint in all; ${d.removed.length} removed under the wider \`${d.mode}\` diff.)`,
    );
    lines.push("");
    if (shown.length) {
      lines.push("```");
      lines.push(shown.map(symbolLabel).join("\n"));
      lines.push("```");
      lines.push("");
    }
  }

  if (ctx.extraInstalls.length) {
    lines.push(
      `_Sandbox: \`${ctx.packageName}@${ctx.version}\` plus ${ctx.extraInstalls.join(", ")}, ` +
        `type-checked under \`strict\` with \`skipLibCheck\`._`,
    );
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("Generated by [SDKProof](https://sdkproof.dev) — `npx sdkproof " + ctx.packageName + "`");
  return lines.join("\n");
}

/** Drift mode's own output — no model was called, so there is no score. */
export function renderDrift(d: DriftReport, verdict: { worth: boolean; reason: string }): string {
  const out: string[] = [];
  const headline = headlineRemovals(d);
  out.push("");
  out.push(BAR);
  out.push(`  ${d.package}  v${d.from.version} -> v${d.to.version}`);
  out.push(BAR);
  out.push("");
  out.push(`  v${d.to.major} landed ${d.majorAgeMonths.toFixed(0)} months ago`);
  if (d.typesFrom) {
    out.push(`  Declarations read from ${d.typesFrom.replace(/@[^@]*$/, "")} — ${d.package} publishes none itself`);
  }
  if (!d.readable) {
    out.push("");
    out.push(`  CANNOT READ THIS PACKAGE — ${d.unreadableReason}.`);
    out.push("  A scored run still works; only this declaration diff does not.");
    out.push("");
    out.push(`  Next:  npx sdkproof ${d.package}`);
    out.push("");
    return out.join("\n");
  }
  out.push(`  ${d.fromCount} exported symbols -> ${d.toCount}  (${d.mode} diff)`);
  out.push("");
  if (headline.length) {
    out.push(`  WHAT LEFT (${headline.length}) — ${headlineSource(d)}`);
    out.push(`  This is what a model trained on v${d.from.major} will still write.`);
    out.push("");
    for (const s of headline.slice(0, 40)) out.push(`    ${symbolLabel(s)}`);
    if (headline.length > 40) out.push(`    ... ${headline.length - 40} more`);
    out.push("");
  }
  const deprecatedFirst = d.removed.filter((s) => !d.withoutRunway.includes(s));
  if (deprecatedFirst.length) {
    out.push(`  Deprecated first, then removed (${deprecatedFirst.length}) — these rarely produce drift:`);
    out.push(`    ${deprecatedFirst.slice(0, 20).map(symbolLabel).join(", ")}${deprecatedFirst.length > 20 ? " ..." : ""}`);
    out.push("");
  }
  const rest = d.removedFromEntry.length - headline.length;
  if (d.documentedRemovals.length && rest > 0) {
    out.push(
      `  (${d.removedFromEntry.length} exports left the entrypoint in total. The ` +
        `${d.documentedRemovals.length} above ${d.documentedRemovals.length === 1 ? "is the one" : "are the ones"} ` +
        `v${d.from.major}'s own README taught people to write; the rest are mostly types.)`,
    );
    out.push("");
  } else if (d.valueRemovals.length && rest > 0) {
    out.push(
      `  (${rest} type-only export(s) also left the entrypoint. They are listed in --json; ` +
        `a model writes a hook far more often than it writes a type name.)`,
    );
    out.push("");
  } else if (d.mode === "all-dts" && d.removedFromEntry.length < d.withoutRunway.length) {
    out.push(
      `  (${d.withoutRunway.length} symbols vanished across every .d.ts in the package, but only the ` +
        `${d.removedFromEntry.length} above were reachable from the entrypoint. The rest are internals.)`,
    );
    out.push("");
  }
  out.push(`  ${verdict.worth ? "WORTH SCORING" : "NOT WORTH SCORING"} — ${verdict.reason}`);
  out.push("");
  if (verdict.worth) out.push(`  Next:  npx sdkproof ${d.package}`);
  out.push("");
  return out.join("\n");
}
