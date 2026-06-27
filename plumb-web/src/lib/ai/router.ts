import { anthropic } from "@ai-sdk/anthropic";
import { google } from "@ai-sdk/google";
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import type { LanguageModel } from "ai";
import { z } from "zod";

export type ModelId =
  | "claude-sonnet"
  | "claude-haiku"
  | "gpt-4o"
  | "gpt-4o-mini"
  | "gemini-flash";

function resolveModel(modelId?: string): LanguageModel {
  const id = (modelId ?? process.env.DEFAULT_MODEL ?? "claude-sonnet") as ModelId;

  switch (id) {
    case "claude-haiku":
      return anthropic("claude-3-5-haiku-latest");
    case "gpt-4o":
      return openai("gpt-4o");
    case "gpt-4o-mini":
      return openai("gpt-4o-mini");
    case "gemini-flash":
      return google("gemini-2.0-flash");
    case "claude-sonnet":
    default:
      return anthropic("claude-sonnet-4-20250514");
  }
}

export async function generateStructured<T extends z.ZodType>(
  input: {
    schema: T;
    system: string;
    prompt: string;
    model?: string;
  },
): Promise<z.infer<T>> {
  const { object } = await generateObject({
    model: resolveModel(input.model),
    schema: input.schema,
    system: input.system,
    prompt: input.prompt,
  });
  return object as z.infer<T>;
}
