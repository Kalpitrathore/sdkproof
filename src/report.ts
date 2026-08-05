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

  // Placed before the failure patterns: on a context run this is the headline,
  // because it is the only number on the page a maintainer can change.
  if (r.contextArms?.length) {
    lines.push(`## With the library's own agent context`);
    lines.push("");
    lines.push(
      `Same tasks, same model. The bare score above is a project with no agent context; ` +
        `each arm below adds the files this library ships for itself.`,
    );
    lines.push("");
    const cmp = r.contextArms[0];
    lines.push(
      `Compared on the **${cmp.comparedOn} tasks every arm produced code for** — a task missing ` +
        `from any arm is dropped from all of them, so an arm cannot score higher for having lost one.`,
    );
    lines.push("");
    lines.push(`| Arm | Score | Passed | Scored | vs bare |`);
    lines.push(`|---|---:|---:|---:|---:|`);
    lines.push(`| bare | ${cmp.baselineScore}/100 | ${Math.round((cmp.baselineScore * cmp.comparedOn) / 100)} | ${cmp.comparedOn} | — |`);
    for (const a of r.contextArms) {
      const sign = a.delta > 0 ? `+${a.delta}` : `${a.delta}`;
      lines.push(`| ${a.name} | ${a.score}/100 | ${a.passed} | ${a.total} | **${sign}** |`);
    }
    lines.push("");
    for (const a of r.contextArms) {
      lines.push(`- \`${a.name}\` — ${a.label}`);
      if (a.fixed.length) lines.push(`  - fixes: ${a.fixed.map((t) => `\`${t}\``).join(", ")}`);
      if (a.failed.length) lines.push(`  - still fails: ${a.failed.map((t) => `\`${t}\``).join(", ")}`);
    }
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
