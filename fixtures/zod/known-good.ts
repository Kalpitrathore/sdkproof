// Hand-authored, known-correct Zod 4 usage — proves the fixture can express a
// PASSING answer. See test/fixtures.test.ts.
//
// Exercises the drift-prone surface: the unified `error` option (v3's
// `required_error`/`invalid_type_error` were removed) and the 2-arg z.record().
import { z } from "zod";

export const UserSchema = z.object({
  email: z.string().email({ error: "must be an email" }),
  name: z.string({ error: "name is required" }).min(1),
  age: z.number().int().positive().optional(),
  role: z.enum(["admin", "user"]),
  tags: z.array(z.string()),
  // v4: z.record takes BOTH a key and a value schema.
  meta: z.record(z.string(), z.unknown()),
});

export type User = z.infer<typeof UserSchema>;

export function run(input: unknown) {
  const parsed = UserSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, issues: parsed.error.issues };
  }
  const strict = UserSchema.parse(input);
  return { ok: true as const, user: parsed.data, strict };
}
