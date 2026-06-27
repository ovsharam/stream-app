import { z } from "zod";
import { generateStructured } from "./router";
import type { ContextGap, ContextScoreResult } from "@/lib/types";

const contextScoreSchema = z.object({
  score: z.number().min(0).max(100),
  gaps: z.array(
    z.object({
      text: z.string(),
      severity: z.enum(["low", "medium", "high"]),
    }),
  ),
  aeSyncNeeded: z.boolean(),
  summary: z.string(),
});

export async function scoreCaseContext(input: {
  externalId: string;
  title: string;
  clientName: string;
  requirements: string[];
  notes?: string;
}): Promise<ContextScoreResult> {
  const reqBlock =
    input.requirements.length > 0
      ? input.requirements.map((r) => `- ${r}`).join("\n")
      : "(no requirements captured yet)";

  return generateStructured({
    schema: contextScoreSchema,
    system: `You score deployment readiness for Forward-Deployed Engineers.
Return JSON only. Score 0-100 for how build-ready the scope is.
Flag aeSyncNeeded when score < 60 or major ambiguities remain.`,
    prompt: `Case ${input.externalId}: ${input.title}
Client: ${input.clientName}

Requirements:
${reqBlock}

Additional context:
${input.notes ?? "(none)"}`,
  });
}

export type { ContextGap };
