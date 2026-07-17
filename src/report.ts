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
  lines.push(`| Model | Score | Passed | Total |`);
  lines.push(`|---|---:|---:|---:|`);
  for (const m of r.perModel) {
    lines.push(`| ${m.model} | ${m.score}/100 | ${m.passed} | ${m.total} |`);
  }
  lines.push("");

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
