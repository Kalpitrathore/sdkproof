// Hand-authored, known-correct Vercel AI SDK 7 usage — proves the fixture can
// express a PASSING answer. See test/fixtures.test.ts.
//
// Exercises the drift-prone surface: the v7 tool rename (`inputSchema`, not
// `parameters`) and `stopWhen` (not `maxSteps`).
import { generateText, generateObject, tool, stepCountIs } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

const weather = tool({
  description: "Get the weather for a city",
  // v7: `inputSchema` — v4's `parameters` was renamed.
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ city }) => ({ city, tempC: 21 }),
});

export async function run() {
  const text = await generateText({
    model: openai("gpt-4o"),
    prompt: "What is the weather in Delhi?",
    tools: { weather },
    // v7: `stopWhen` — v4's `maxSteps` was replaced.
    stopWhen: stepCountIs(5),
  });

  const obj = await generateObject({
    model: openai("gpt-4o"),
    schema: z.object({ summary: z.string(), score: z.number() }),
    prompt: "Summarise the weather.",
  });

  return { text: text.text, object: obj.object };
}
