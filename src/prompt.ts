import type { LibrarySpec, Task } from "./types.ts";

export const GENERATION_SYSTEM =
  "You are an expert TypeScript developer. Implement the requested function using the specified library. " +
  "Respond with ONLY the complete TypeScript module inside a single ```ts code block — no explanation before or after. " +
  "Keep the provided imports and the `declare const prisma` line exactly as given; do NOT construct the client yourself. " +
  "Fill in the function body so the module type-checks against the real installed package.";

export function buildUserPrompt(task: Task, spec: LibrarySpec): string {
  return [
    `Library: ${spec.displayName}, imported from "${spec.packageName}".`,
    spec.docsHint,
    "",
    `Task: ${task.prompt}`,
    "",
    "Complete this module:",
    "```ts",
    task.skeleton,
    "```",
  ].join("\n");
}

// Prefer a fenced ts/typescript block; fall back to the raw text.
const FENCE = /```(?:ts|typescript)?\s*\n([\s\S]*?)```/;

export function extractCode(text: string): string {
  const m = FENCE.exec(text);
  return (m ? m[1] : text).trim();
}
