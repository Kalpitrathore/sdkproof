import type { Candidate, LibrarySpec, Task } from "./types.ts";
import type { ModelAdapter } from "./models/types.ts";
import { GENERATION_SYSTEM, buildUserPrompt, extractCode } from "./prompt.ts";

/** Ask one model to solve one task; return the extracted code candidate. */
export async function generate(
  task: Task,
  model: ModelAdapter,
  spec: LibrarySpec,
): Promise<Candidate> {
  const raw = await model.generate({
    system: GENERATION_SYSTEM,
    user: buildUserPrompt(task, spec),
  });
  return { taskId: task.id, model: model.id, code: extractCode(raw) };
}
