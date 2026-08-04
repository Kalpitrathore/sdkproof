import type { LibrarySpec, Result } from "./types.ts";

/** Render a Result into a human-readable markdown scorecard. */
export function renderScorecard(r: Result, spec: LibrarySpec): string {
  const lines: string[] = [];
  lines.push(`# ${spec.displayName} — AI-Readiness Scorecard`);
  lines.push("");
  lines.push(`**Library:** \`${spec.packageName}\` v${r.libraryVersion}  `);
  lines.push(`**Generated:** ${r.generatedAt}  `);
  lines.push(
    `**Method:** type-check only — measures whether agent-generated code uses the real, current API surface. Not a runtime test.`,
  );
  lines.push("");
  lines.push(`## Overall: ${r.overallScore}/100`);
  lines.push("");
  lines.push(`| Model | Score | Passed | Scored | Refused |`);
  lines.push(`|---|---:|---:|---:|---:|`);
  for (const m of r.perModel) {
    const refused = r.refusals.filter((x) => x.model === m.model).length;
    lines.push(`| ${m.model} | ${m.score}/100 | ${m.passed} | ${m.total} | ${refused || "—"} |`);
  }
  lines.push("");

  // Refusals are stated before the failures, not in a footnote. A score built on
  // fewer tasks than were written is a weaker measurement, and the reader has to
  // see that at the same moment they see the number.
  if (r.refusals.length) {
    const byTask = [...new Set(r.refusals.map((x) => x.taskId))];
    const attempts = Math.max(...r.refusals.map((x) => x.attempts));
    lines.push(`## ⚠️ ${r.refusals.length} task${r.refusals.length === 1 ? "" : "s"} refused — not measured`);
    lines.push("");
    lines.push(
      `The model declined to write code for the following, after ${attempts} attempts at the identical prompt. ` +
        `**These are excluded from the score above**: no code was produced, so nothing about the library was tested. ` +
        `A refusal is not evidence the API is hard to use, and it is not drift.`,
    );
    lines.push("");
    for (const t of byTask) {
      const models = r.refusals.filter((x) => x.taskId === t).map((x) => x.model);
      lines.push(`- \`${t}\` — ${models.join(", ")}`);
    }
    lines.push("");
    lines.push(
      `**Read the score as covering ${r.perModel[0]?.total ?? 0} of ${(r.perModel[0]?.total ?? 0) + byTask.length} written tasks.**`,
    );
    lines.push("");
  }

  if (r.failurePatterns.length) {
    lines.push(`## Top failure patterns`);
    lines.push("");
    for (const p of r.failurePatterns) {
      lines.push(`### ${p.category} — ${p.count}×`);
      lines.push("");
      lines.push("```");
      lines.push(p.example.message);
      lines.push("```");
      lines.push(`_${p.example.model} on task \`${p.example.taskId}\`_`);
      lines.push("");
    }
  } else {
    lines.push(`_No failures — every model used the API correctly on every task._`);
  }
  return lines.join("\n") + "\n";
}
