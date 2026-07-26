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

// Prefer the *longest* fenced ts/js block; fall back to the raw text with any
// stray fence markers stripped. Taking the longest (not the first) guards
// against a stray early ``` — in a comment or string — truncating the capture,
// which otherwise produces a broken fragment and a false compile failure.
const FENCE = /```(?:ts|typescript|tsx|js|javascript)?[^\S\r\n]*\r?\n([\s\S]*?)```/g;

export function extractCode(text: string): string {
  const blocks = [...text.matchAll(FENCE)].map((m) => m[1].trim());
  if (blocks.length > 0) return blocks.reduce((a, b) => (b.length > a.length ? b : a));
  return text.replace(/^```[a-z]*[^\S\r\n]*\r?\n?/i, "").replace(/```\s*$/i, "").trim();
}
