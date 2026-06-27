import { z } from "zod";
import { generateStructured } from "./router";
import type { IntakeExtraction } from "@/lib/types";

const intakeSchema = z.object({
  client: z.string(),
  title: z.string(),
  requirements: z.array(z.string()),
  initialContextScore: z.number().min(0).max(100),
  valueUsd: z.number().optional(),
  aeName: z.string().optional(),
});

export async function extractCaseFromText(raw: string): Promise<IntakeExtraction> {
  return generateStructured({
    schema: intakeSchema,
    system: `Extract a structured FDE deployment case from call transcripts or email threads.
Infer client name, concise title, requirement bullets, and an initial context score.`,
    prompt: raw.slice(0, 12000),
  });
}
