import { z } from "zod";
import { generateStructured } from "./router";

const buildPromptSchema = z.object({
  buildPrompt: z.string(),
  steps: z.array(z.string()),
  gotchas: z.array(z.string()),
});

export async function generateBuildPrompt(input: {
  externalId: string;
  title: string;
  clientName: string;
  requirements: string[];
  contextScore: number;
  contextGaps: unknown[];
}): Promise<string> {
  const result = await generateStructured({
    schema: buildPromptSchema,
    system: `You are Plumb, an agent that produces ordered build prompts for FDE deployments.
Output a markdown build prompt with steps and known gotchas.`,
    prompt: `Case ${input.externalId}: ${input.title}
Client: ${input.clientName}
Context score: ${input.contextScore}/100

Requirements:
${input.requirements.map((r) => `- ${r}`).join("\n")}

Known gaps:
${JSON.stringify(input.contextGaps, null, 2)}`,
  });

  const sections = [
    `# Build prompt — ${input.externalId}`,
    "",
    result.buildPrompt,
    "",
    "## Steps",
    ...result.steps.map((s, i) => `${i + 1}. ${s}`),
    "",
    "## Gotchas",
    ...result.gotchas.map((g) => `- ${g}`),
  ];

  return sections.join("\n");
}
