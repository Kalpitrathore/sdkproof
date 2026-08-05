// Loads the agent context a library ships for itself, for the second scoring arm.
//
// The premise, from a Prisma maintainer on 2026-07-31: "does it still do that
// even with the skills that `prisma init` installs?" A score for how well a model
// knows an API is not something a maintainer can change. A score for whether the
// docs they ship actually close the gap is.
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { AgentContextSpec, ContextArm } from "./types.ts";

/**
 * A guard, not a preference. Context is prepended to every task prompt, so a
 * runaway arm multiplies cost across the whole task set and can push a long task
 * toward the token ceiling. Refuse rather than silently truncate — a truncated
 * context arm would score lower for a reason that has nothing to do with the
 * library's docs.
 */
const MAX_CONTEXT_CHARS = 120_000;

/** Read one arm's files and join them with their paths, as an agent would see them. */
export async function loadArm(spec: AgentContextSpec, arm: ContextArm): Promise<string> {
  const parts: string[] = [];
  for (const rel of arm.files) {
    const file = path.join(spec.dir, ...rel.split("/"));
    parts.push(`--- ${rel} ---\n${await readFile(file, "utf8")}`);
  }
  const text = parts.join("\n\n");
  if (text.length > MAX_CONTEXT_CHARS) {
    throw new Error(
      `context arm "${arm.name}" is ${text.length} chars, over the ${MAX_CONTEXT_CHARS} limit — split it into arms rather than truncating`,
    );
  }
  return text;
}

/** Load every arm up front, so a missing file fails before any tokens are spent. */
export async function loadArms(spec: AgentContextSpec): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const arm of spec.arms) out.set(arm.name, await loadArm(spec, arm));
  return out;
}
