// Turns a scored run into a list of changes a maintainer could actually make.
//
// A score is a fact about a model, which a maintainer cannot control. This is
// the part they can. Validated by hand on the Prisma page first (2026-08-06):
// the shape only works when each item is derived from a measurement, because
// the moment it becomes general advice about writing good documentation it
// loses everything the compiler-decides framing earned.
//
// Hard rule, enforced below: a recommendation with no evidence is not emitted.
// Rules, not a model. The advice stays derived the same way the scores are.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentContextSpec, LibrarySpec, Recommendation, Result } from "./types.ts";

/** Quoted identifiers in a tsc diagnostic: the API surface the model got wrong. */
function termsFrom(message: string): string[] {
  const out = new Set<string>();
  for (const m of message.matchAll(/'([A-Za-z_$][\w$]*)'/g)) {
    const t = m[1];
    // Skip type names that are noise here — we want the option/member the
    // model reached for, not the type it failed to satisfy.
    if (/^(Subset|Object|Argument|Type|string|number|boolean|any|unknown)$/.test(t)) continue;
    out.add(t);
  }
  return [...out];
}

/** Categorical statements: the phrasing that leaves a reader nothing to decide. */
const FLAT = /\b(mandatory|required|must|throws|will throw|no longer|removed|does not exist)\b/i;
/** Conditional phrasing: correct, and easy for a reader to rule out. */
const HEDGED = /\b(if you|when you|for the .* workflow|optional|recommended|you can|may)\b/i;

async function loadFiles(ctx: AgentContextSpec): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const arm of ctx.arms) {
    for (const rel of arm.files) {
      if (files.has(rel)) continue;
      files.set(rel, await readFile(path.join(ctx.dir, ...rel.split("/")), "utf8"));
    }
  }
  return files;
}

/** The pack an agent routing on skill NAME would load for a given task area. */
function routedPack(files: string[], taskId: string): string | undefined {
  const words = taskId.split("-").filter((w) => w.length > 3);
  return files.find((f) => words.some((w) => f.toLowerCase().includes(w.toLowerCase())));
}

export async function recommend(
  result: Result,
  spec: LibrarySpec,
  survey?: { rows: Array<{ name: string; files: Array<{ url: string; chars: number; linkPct?: number }> }> },
): Promise<Recommendation[]> {
  const out: Recommendation[] = [];
  const failed = result.verdicts.filter((v) => !v.passed);
  const ctx = spec.agentContext;

  if (ctx && result.contextArms?.length) {
    const files = await loadFiles(ctx);
    const allFiles = [...files.keys()];
    const fixedByAnyArm = new Set(result.contextArms.flatMap((a) => a.fixed));

    for (const v of failed) {
      const terms = v.errors.flatMap((e) => termsFrom(e.message));
      const arm = result.contextArms.find((a) => a.fixed.includes(v.taskId));
      const routed = routedPack(allFiles, v.taskId);

      // RULE 1 — the answer exists, in a file nobody would route to.
      // Only emitted when an arm demonstrably fixes the task AND a term from
      // the diagnostic appears in that arm's files but not in the routed pack.
      if (arm && routed) {
        for (const term of terms) {
          const mentions = allFiles.filter((f) => files.get(f)!.includes(term));
          if (!mentions.length) continue;
          if (mentions.some((f) => f === routed)) continue;
          out.push({
            id: `term-not-in-routed-pack:${v.taskId}:${term}`,
            severity: "high",
            title: `\`${routed}\` never mentions \`${term}\``,
            detail:
              `The failing task writes \`${term}\`. It is fixed only with \`${mentions[0]}\` in context — ` +
              `and that file is not the one an agent routing on skill name would load for this task. ` +
              `Moving the statement into \`${routed}\` puts the answer where the question gets asked.`,
            evidence: [
              `${v.taskId} fails bare (${v.errors[0]?.code}) and passes in the "${arm.name}" arm`,
              `\`${term}\` appears in ${mentions.map((m) => `\`${m}\``).join(", ")} and not in \`${routed}\``,
            ],
          });
        }
      }

      // RULE 2 — the categorical statement is in the wrong file.
      const flatFiles = allFiles.filter((f) => {
        const body = files.get(f)!;
        return terms.some((t) => body.includes(t)) && FLAT.test(body);
      });
      if (routed && flatFiles.length && !flatFiles.includes(routed) && HEDGED.test(files.get(routed) ?? "")) {
        out.push({
          id: `flat-statement-misplaced:${v.taskId}`,
          severity: "medium",
          title: `The direct phrasing lives outside \`${routed}\``,
          detail:
            `\`${flatFiles[0]}\` states the requirement categorically; \`${routed}\` phrases it as a condition ` +
            `the reader has to decide applies to them. Same requirement, and the unambiguous version is in the ` +
            `file an agent is least likely to load.`,
          evidence: [
            `\`${flatFiles[0]}\` matches categorical phrasing near the failing term`,
            `\`${routed}\` is the name-routed pack for ${v.taskId} and phrases it conditionally`,
          ],
        });
      }

      // RULE 3 — no shipped document fixes it. The most honest item on the list.
      if (!fixedByAnyArm.has(v.taskId)) {
        out.push({
          id: `unfixed-by-any-arm:${v.taskId}`,
          severity: "high",
          title: `Nothing you ship fixes \`${v.taskId}\``,
          detail:
            `This failure survives every document measured, including the ones that fix the others. ` +
            `No change to the files above is known to close it — stating that is more useful than guessing at one.`,
          evidence: result.contextArms.map(
            (a) => `still fails with the "${a.name}" arm in context (${a.trials} trials)`,
          ),
        });
      }
    }
  }

  // RULE 4 — what the library publishes for agents, from the survey.
  const row = survey?.rows.find((r) => r.name.toLowerCase().includes(spec.displayName.toLowerCase()));
  if (row) {
    const usable = row.files.filter((f) => f.chars > 0 && f.chars < 120_000 && (f.linkPct ?? 100) < 30);
    const biggest = row.files.reduce((a, b) => (b.chars > a.chars ? b : a), row.files[0]);
    if (usable.length) {
      out.push({
        id: "agent-docs-usable",
        severity: "info",
        title: `Your agent documentation is already usable without fetching`,
        detail:
          `\`${usable[0].url}\` is ${usable[0].chars.toLocaleString()} characters of prose. Most libraries publish ` +
          `a link index a model cannot follow, or a bundle too large to put in a prompt. This is a routing ` +
          `problem, not a writing problem.`,
        evidence: [`${usable[0].url}: ${usable[0].chars.toLocaleString()} chars, ${usable[0].linkPct}% link lines`],
      });
    } else if (biggest?.chars) {
      out.push({
        id: "agent-docs-unusable",
        severity: "medium",
        title: `Nothing you publish for agents fits in a prompt`,
        detail:
          `\`${biggest.url}\` is ${biggest.chars.toLocaleString()} characters${
            (biggest.linkPct ?? 0) > 50 ? " and mostly a list of links" : ""
          }. A model that cannot fetch gets nothing usable from it. A small, self-contained file covering the ` +
          `drift-prone surface would be readable in one request.`,
        evidence: [`${biggest.url}: ${biggest.chars.toLocaleString()} chars, ${biggest.linkPct ?? 0}% link lines`],
      });
    }
  }

  // The rule that keeps this honest.
  return out.filter((r) => r.evidence.length > 0);
}
