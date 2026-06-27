"use server";

import { revalidatePath } from "next/cache";
import { getSessionUser } from "@/lib/supabase/server";
import {
  addRequirement,
  classifyCase,
  createCase,
  getCase,
  getUserOrg,
  logIngest,
  logOpenCase,
  nextExternalId,
  saveBuildPrompt,
  updateCaseStage,
  updateContextScore,
  updateRequirementStatus,
} from "@/lib/db/cases";
import { scoreCaseContext } from "@/lib/ai/context-score";
import { extractCaseFromText } from "@/lib/ai/intake";
import { generateBuildPrompt } from "@/lib/ai/build-prompt";
import { fetchInboxThreads } from "@/lib/integrations/inbox";
import type { CaseStage, CaseType } from "@/lib/types";

async function requireActor() {
  const user = await getSessionUser();
  if (!user?.email) throw new Error("Unauthorized");
  const org = await getUserOrg(user.id);
  if (!org) throw new Error("No organization — complete onboarding first");
  return { userId: user.id, orgId: org.orgId };
}

export async function getCaseDetailAction(caseId: string) {
  const { orgId } = await requireActor();
  return getCase(orgId, caseId);
}

export async function moveCaseStageAction(caseId: string, stage: CaseStage) {
  try {
    const { userId, orgId } = await requireActor();
    await updateCaseStage({ orgId, caseId, stage, actorUserId: userId });
    revalidatePath("/app");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to move case" };
  }
}

export async function rescoreContextAction(caseId: string) {
  try {
    const { userId, orgId } = await requireActor();
    const detail = await getCase(orgId, caseId);
    if (!detail) return { error: "Case not found" };

    const result = await scoreCaseContext({
      externalId: detail.externalId,
      title: detail.title,
      clientName: detail.clientName,
      requirements: detail.requirements.map((r) => r.text),
    });

    await updateContextScore({
      orgId,
      caseId,
      score: result.score,
      gaps: result.gaps,
      actorUserId: userId,
      aeSyncNeeded: result.aeSyncNeeded,
    });

    revalidatePath("/app");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Scoring failed" };
  }
}

export async function classifyCaseAction(caseId: string, type: CaseType) {
  try {
    const { userId, orgId } = await requireActor();
    await classifyCase({ orgId, caseId, type, actorUserId: userId });
    revalidatePath("/app");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Classification failed" };
  }
}

export async function kickoffBuildAction(
  caseId: string,
  path: "plumb" | "mcp",
) {
  try {
    const { userId, orgId } = await requireActor();
    const detail = await getCase(orgId, caseId);
    if (!detail) return { error: "Case not found" };

    let buildPrompt: string | undefined;
    if (path === "plumb") {
      buildPrompt = await generateBuildPrompt({
        externalId: detail.externalId,
        title: detail.title,
        clientName: detail.clientName,
        requirements: detail.requirements.map((r) => r.text),
        contextScore: detail.contextScore,
        contextGaps: detail.contextGaps as unknown[],
      });
    }

    await saveBuildPrompt({
      orgId,
      caseId,
      buildPrompt: buildPrompt ?? "",
      actorUserId: userId,
      path,
    });

    revalidatePath("/app");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Kickoff failed" };
  }
}

export async function openCaseAction(caseId: string) {
  try {
    const { userId, orgId } = await requireActor();
    const detail = await getCase(orgId, caseId);
    if (!detail) return { error: "Case not found" };
    await logOpenCase({
      orgId,
      caseId,
      actorUserId: userId,
      externalId: detail.externalId,
    });
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed" };
  }
}

export async function ingestCaseAction(raw: string) {
  try {
    const { userId, orgId } = await requireActor();
    const extracted = await extractCaseFromText(raw);
    const externalId = await nextExternalId(orgId);

    const created = await createCase({
      orgId,
      clientName: extracted.client,
      externalId,
      title: extracted.title,
      stage: "intake",
      contextScore: extracted.initialContextScore,
      valueUsd: extracted.valueUsd ?? 0,
      aeName: extracted.aeName ?? null,
      requirements: extracted.requirements,
      actorUserId: userId,
    });

    await logIngest({
      orgId,
      caseId: created.id,
      actorUserId: userId,
      source: "paste",
    });

    revalidatePath("/app");
    return { caseId: created.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Intake failed" };
  }
}

export async function addRequirementAction(caseId: string, text: string) {
  try {
    const trimmed = text.trim();
    if (!trimmed) return { error: "Requirement text required" };
    const { orgId } = await requireActor();
    await addRequirement({ orgId, caseId, text: trimmed });
    revalidatePath("/app");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to add requirement" };
  }
}

export async function updateRequirementStatusAction(
  requirementId: string,
  status: "open" | "confirmed" | "dropped",
) {
  try {
    const { orgId } = await requireActor();
    await updateRequirementStatus({ orgId, requirementId, status });
    revalidatePath("/app");
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Failed to update requirement" };
  }
}

export async function ingestFromInboxAction(threadId: string) {
  try {
    const { userId, orgId } = await requireActor();
    const threads = await fetchInboxThreads(orgId, "gmail");
    const thread = threads.find((t) => t.id === threadId);
    if (!thread) return { error: "Thread not found" };

    const raw = `${thread.subject}\n\n${thread.preview}`;
    const extracted = await extractCaseFromText(raw);
    const externalId = await nextExternalId(orgId);

    const created = await createCase({
      orgId,
      clientName: extracted.client,
      externalId,
      title: extracted.title,
      stage: "intake",
      contextScore: extracted.initialContextScore,
      requirements: extracted.requirements,
      actorUserId: userId,
    });

    await logIngest({
      orgId,
      caseId: created.id,
      actorUserId: userId,
      source: `gmail:${threadId}`,
    });

    revalidatePath("/app");
    return { caseId: created.id };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Inbox ingest failed" };
  }
}
