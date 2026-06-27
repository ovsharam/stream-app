import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "./index";
import {
  caseEvents,
  caseRequirements,
  cases,
  clients,
  users,
  type CaseEventRow,
  type CaseRow,
} from "./schema";
import type { CaseEventKind, CaseStage, CaseType, ContextGap } from "@/lib/types";

export interface CaseWithClient extends CaseRow {
  clientName: string;
  signalCount: number;
}

export interface CaseDetail extends CaseWithClient {
  requirements: { id: string; text: string; status: string }[];
  events: CaseEventRow[];
}

export async function getUserOrg(userId: string) {
  const db = getDb();
  const [row] = await db
    .select({ orgId: users.orgId, role: users.role, name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row ?? null;
}

export async function createUserProfile(input: {
  id: string;
  orgId: string;
  email: string;
  name?: string;
  role?: "fde" | "ae" | "am" | "se" | "ce" | "swe" | "admin";
}) {
  const db = getDb();
  await db
    .insert(users)
    .values({
      id: input.id,
      orgId: input.orgId,
      email: input.email,
      name: input.name ?? input.email.split("@")[0] ?? "Operator",
      role: input.role ?? "fde",
    })
    .onConflictDoNothing();
  return getUserOrg(input.id);
}

export async function getCases(orgId: string): Promise<CaseWithClient[]> {
  const db = getDb();
  const rows = await db
    .select({
      case: cases,
      clientName: clients.name,
      signalCount: sql<number>`(
        SELECT COUNT(*)::int FROM case_events
        WHERE case_events.case_id = ${cases.id}
      )`.as("signal_count"),
    })
    .from(cases)
    .innerJoin(clients, eq(cases.clientId, clients.id))
    .where(eq(cases.orgId, orgId))
    .orderBy(desc(cases.updatedAt));

  return rows.map((r) => ({
    ...r.case,
    clientName: r.clientName,
    signalCount: r.signalCount,
  }));
}

export async function getCase(orgId: string, caseId: string): Promise<CaseDetail | null> {
  const db = getDb();
  const [row] = await db
    .select({
      case: cases,
      clientName: clients.name,
      signalCount: sql<number>`(
        SELECT COUNT(*)::int FROM case_events
        WHERE case_events.case_id = ${cases.id}
      )`.as("signal_count"),
    })
    .from(cases)
    .innerJoin(clients, eq(cases.clientId, clients.id))
    .where(and(eq(cases.orgId, orgId), eq(cases.id, caseId)))
    .limit(1);

  if (!row) return null;

  const requirements = await db
    .select({
      id: caseRequirements.id,
      text: caseRequirements.text,
      status: caseRequirements.status,
    })
    .from(caseRequirements)
    .where(eq(caseRequirements.caseId, caseId));

  const events = await db
    .select()
    .from(caseEvents)
    .where(eq(caseEvents.caseId, caseId))
    .orderBy(desc(caseEvents.createdAt))
    .limit(50);

  return {
    ...row.case,
    clientName: row.clientName,
    signalCount: row.signalCount,
    requirements,
    events,
  };
}

export async function getBoardStats(orgId: string) {
  const db = getDb();
  const [stats] = await db
    .select({
      openCases: sql<number>`COUNT(*) FILTER (WHERE stage != 'deploy')::int`,
      pipelineUsd: sql<number>`COALESCE(SUM(value_usd) FILTER (WHERE stage != 'deploy'), 0)::int`,
      contextGaps: sql<number>`COUNT(*) FILTER (WHERE context_score < 60)::int`,
      signalsLogged: sql<number>`(
        SELECT COUNT(*)::int FROM case_events WHERE org_id = ${orgId}
      )`,
    })
    .from(cases)
    .where(eq(cases.orgId, orgId));

  return (
    stats ?? {
      openCases: 0,
      pipelineUsd: 0,
      contextGaps: 0,
      signalsLogged: 0,
    }
  );
}

export async function getLatestEvent(orgId: string): Promise<CaseEventRow | null> {
  const db = getDb();
  const [event] = await db
    .select()
    .from(caseEvents)
    .where(eq(caseEvents.orgId, orgId))
    .orderBy(desc(caseEvents.createdAt))
    .limit(1);
  return event ?? null;
}

export async function createCase(input: {
  orgId: string;
  clientName: string;
  externalId: string;
  title: string;
  stage?: CaseStage;
  type?: CaseType | null;
  contextScore?: number;
  contextGaps?: ContextGap[];
  valueUsd?: number;
  aeName?: string | null;
  requirements?: string[];
  actorUserId?: string;
}) {
  const db = getDb();

  let [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.orgId, input.orgId), eq(clients.name, input.clientName)))
    .limit(1);

  if (!client) {
    [client] = await db
      .insert(clients)
      .values({ orgId: input.orgId, name: input.clientName })
      .returning();
  }

  const [created] = await db
    .insert(cases)
    .values({
      orgId: input.orgId,
      clientId: client.id,
      externalId: input.externalId,
      title: input.title,
      stage: input.stage ?? "intake",
      type: input.type ?? null,
      contextScore: input.contextScore ?? 0,
      contextGaps: input.contextGaps ?? [],
      valueUsd: input.valueUsd ?? 0,
      aeName: input.aeName ?? null,
    })
    .returning();

  if (input.requirements?.length) {
    await db.insert(caseRequirements).values(
      input.requirements.map((text) => ({
        caseId: created.id,
        text,
        status: "open" as const,
      })),
    );
  }

  await addEvent({
    orgId: input.orgId,
    caseId: created.id,
    actorUserId: input.actorUserId,
    kind: "intake",
    detail: `Case ${input.externalId} created`,
    payload: { title: input.title, client: input.clientName },
  });

  return created;
}

export async function updateCaseStage(input: {
  orgId: string;
  caseId: string;
  stage: CaseStage;
  actorUserId?: string;
  minContextScore?: number;
}) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(cases)
    .where(and(eq(cases.orgId, input.orgId), eq(cases.id, input.caseId)))
    .limit(1);

  if (!existing) throw new Error("Case not found");

  const stageOrder: CaseStage[] = ["intake", "context", "build", "test", "deploy"];
  const fromIdx = stageOrder.indexOf(existing.stage);
  const toIdx = stageOrder.indexOf(input.stage);

  const advancingPastContext =
    fromIdx <= stageOrder.indexOf("context") &&
    toIdx > stageOrder.indexOf("context");

  if (advancingPastContext) {
    const min = input.minContextScore ?? 60;
    if (existing.contextScore < min) {
      throw new Error(
        `Context score must be at least ${min} to advance past Context Check`,
      );
    }
  }

  const [updated] = await db
    .update(cases)
    .set({ stage: input.stage, updatedAt: new Date() })
    .where(and(eq(cases.orgId, input.orgId), eq(cases.id, input.caseId)))
    .returning();

  await addEvent({
    orgId: input.orgId,
    caseId: input.caseId,
    actorUserId: input.actorUserId,
    kind: "stage_change",
    detail: `Moved ${existing.externalId} to ${input.stage}`,
    payload: { from: existing.stage, to: input.stage },
  });

  return updated;
}

export async function updateContextScore(input: {
  orgId: string;
  caseId: string;
  score: number;
  gaps: ContextGap[];
  actorUserId?: string;
  aeSyncNeeded?: boolean;
}) {
  const db = getDb();
  const [updated] = await db
    .update(cases)
    .set({
      contextScore: input.score,
      contextGaps: input.gaps,
      updatedAt: new Date(),
    })
    .where(and(eq(cases.orgId, input.orgId), eq(cases.id, input.caseId)))
    .returning();

  await addEvent({
    orgId: input.orgId,
    caseId: input.caseId,
    actorUserId: input.actorUserId,
    kind: "context_score",
    detail: `Context scored ${input.score}/100`,
    payload: { score: input.score, gaps: input.gaps, aeSyncNeeded: input.aeSyncNeeded },
  });

  if (input.aeSyncNeeded) {
    await addEvent({
      orgId: input.orgId,
      caseId: input.caseId,
      actorUserId: input.actorUserId,
      kind: "ae_sync",
      detail: "AE sync recommended",
      payload: { score: input.score },
    });
  }

  return updated;
}

export async function classifyCase(input: {
  orgId: string;
  caseId: string;
  type: CaseType;
  actorUserId?: string;
}) {
  const db = getDb();
  const dueDate = new Date();
  if (input.type === "quickwin") {
    dueDate.setDate(dueDate.getDate() + 21);
  } else {
    dueDate.setDate(dueDate.getDate() + 28);
  }

  const [updated] = await db
    .update(cases)
    .set({ type: input.type, dueDate, updatedAt: new Date() })
    .where(and(eq(cases.orgId, input.orgId), eq(cases.id, input.caseId)))
    .returning();

  await addEvent({
    orgId: input.orgId,
    caseId: input.caseId,
    actorUserId: input.actorUserId,
    kind: "classify",
    detail: `Classified as ${input.type}`,
    payload: { type: input.type, dueDate: dueDate.toISOString() },
  });

  return updated;
}

export async function saveBuildPrompt(input: {
  orgId: string;
  caseId: string;
  buildPrompt: string;
  actorUserId?: string;
  path: "plumb" | "mcp";
}) {
  const db = getDb();

  if (input.path === "plumb") {
    await db
      .update(cases)
      .set({ buildPrompt: input.buildPrompt, updatedAt: new Date() })
      .where(and(eq(cases.orgId, input.orgId), eq(cases.id, input.caseId)));
  }

  await addEvent({
    orgId: input.orgId,
    caseId: input.caseId,
    actorUserId: input.actorUserId,
    kind: "build_kickoff",
    detail: input.path === "plumb" ? "Plumb agent build prompt generated" : "Handed off to MCP stack",
    payload: { path: input.path },
  });
}

export async function addEvent(input: {
  orgId: string;
  caseId: string;
  actorUserId?: string;
  kind: CaseEventKind;
  detail: string;
  payload?: Record<string, unknown>;
}) {
  const db = getDb();
  const [event] = await db
    .insert(caseEvents)
    .values({
      orgId: input.orgId,
      caseId: input.caseId,
      actorUserId: input.actorUserId ?? null,
      kind: input.kind,
      detail: input.detail,
      payload: input.payload ?? {},
    })
    .returning();
  return event;
}

export async function logOpenCase(input: {
  orgId: string;
  caseId: string;
  actorUserId?: string;
  externalId: string;
}) {
  return addEvent({
    orgId: input.orgId,
    caseId: input.caseId,
    actorUserId: input.actorUserId,
    kind: "open_case",
    detail: `Opened ${input.externalId}`,
    payload: {},
  });
}

export async function logIngest(input: {
  orgId: string;
  caseId: string;
  actorUserId?: string;
  source: string;
}) {
  return addEvent({
    orgId: input.orgId,
    caseId: input.caseId,
    actorUserId: input.actorUserId,
    kind: "ingest",
    detail: `Ingested from ${input.source}`,
    payload: { source: input.source },
  });
}

export async function addRequirement(input: {
  orgId: string;
  caseId: string;
  text: string;
}) {
  const db = getDb();
  const [existing] = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(eq(cases.orgId, input.orgId), eq(cases.id, input.caseId)))
    .limit(1);
  if (!existing) throw new Error("Case not found");

  const [req] = await db
    .insert(caseRequirements)
    .values({ caseId: input.caseId, text: input.text, status: "open" })
    .returning();

  await db
    .update(cases)
    .set({ updatedAt: new Date() })
    .where(eq(cases.id, input.caseId));

  return req;
}

export async function updateRequirementStatus(input: {
  orgId: string;
  requirementId: string;
  status: "open" | "confirmed" | "dropped";
}) {
  const db = getDb();
  // Verify the requirement belongs to a case in this org
  const [req] = await db
    .select({ caseRequirements, caseId: caseRequirements.caseId })
    .from(caseRequirements)
    .innerJoin(cases, eq(caseRequirements.caseId, cases.id))
    .where(
      and(
        eq(caseRequirements.id, input.requirementId),
        eq(cases.orgId, input.orgId),
      ),
    )
    .limit(1);

  if (!req) throw new Error("Requirement not found");

  const [updated] = await db
    .update(caseRequirements)
    .set({ status: input.status })
    .where(eq(caseRequirements.id, input.requirementId))
    .returning();

  return updated;
}

export async function getOrCreateClient(orgId: string, name: string) {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.orgId, orgId), eq(clients.name, name)))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(clients).values({ orgId, name }).returning();
  return created;
}

export async function nextExternalId(orgId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(cases)
    .where(eq(cases.orgId, orgId));
  const n = (row?.count ?? 0) + 100;
  return `FDE-${n}`;
}
