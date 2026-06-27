import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/lib/db/schema";

const DEMO_ORG_ID = "11111111-1111-4111-8111-111111111111";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");

  const client = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(client, { schema });

  await db
    .insert(schema.organizations)
    .values({ id: DEMO_ORG_ID, name: "Applied Scope Demo" })
    .onConflictDoNothing();

  const clientRows = [
    { id: "22222222-2222-4222-8222-222222222201", name: "Northwind Telephony" },
    { id: "22222222-2222-4222-8222-222222222202", name: "Cobalt Health" },
    { id: "22222222-2222-4222-8222-222222222203", name: "Drift Logistics" },
    { id: "22222222-2222-4222-8222-222222222204", name: "Atlas Freight" },
    { id: "22222222-2222-4222-8222-222222222205", name: "Meridian Bank" },
  ];

  for (const c of clientRows) {
    await db
      .insert(schema.clients)
      .values({ id: c.id, orgId: DEMO_ORG_ID, name: c.name })
      .onConflictDoNothing();
  }

  const seedCases = [
    {
      id: "33333333-3333-4333-8333-333333333301",
      clientId: clientRows[0].id,
      externalId: "FDE-104",
      title: "CRM contact lookup on inbound, near-realtime",
      stage: "context" as const,
      type: "quickwin" as const,
      contextScore: 42,
      valueUsd: 48_000,
      aeName: "Dana R.",
      reqs: [
        "Salesforce org",
        "OAuth scope (unconfirmed)",
        "200ms latency target",
      ],
    },
    {
      id: "33333333-3333-4333-8333-333333333302",
      clientId: clientRows[1].id,
      externalId: "FDE-101",
      title: "Generative agent for tier-1 patient triage",
      stage: "build" as const,
      type: "bigbet" as const,
      contextScore: 88,
      valueUsd: 220_000,
      aeName: "Marcus L.",
      reqs: [
        "HIPAA boundary",
        "Epic FHIR read",
        "Human-in-loop gate",
        "Eval harness",
      ],
    },
    {
      id: "33333333-3333-4333-8333-333333333303",
      clientId: clientRows[2].id,
      externalId: "FDE-107",
      title: "Slack alert router for SLA breaches",
      stage: "intake" as const,
      type: null,
      contextScore: 19,
      valueUsd: 0,
      aeName: null,
      reqs: ["(awaiting scoping call)"],
    },
    {
      id: "33333333-3333-4333-8333-333333333304",
      clientId: clientRows[3].id,
      externalId: "FDE-098",
      title: "Power-dialer + voice agent handoff",
      stage: "test" as const,
      type: "quickwin" as const,
      contextScore: 95,
      valueUsd: 31_000,
      aeName: "Dana R.",
      reqs: [
        "Twilio number pool",
        "Warm-transfer logic",
        "Fallback to human",
      ],
    },
    {
      id: "33333333-3333-4333-8333-333333333305",
      clientId: clientRows[4].id,
      externalId: "FDE-090",
      title: "Headless onboarding workflow builder",
      stage: "deploy" as const,
      type: "bigbet" as const,
      contextScore: 91,
      valueUsd: 410_000,
      aeName: "Priya S.",
      reqs: [
        "SOC2 evidence",
        "SSO (Okta)",
        "Audit log export",
        "4 custom connectors",
      ],
    },
  ];

  for (const sc of seedCases) {
    await db
      .insert(schema.cases)
      .values({
        id: sc.id,
        orgId: DEMO_ORG_ID,
        clientId: sc.clientId,
        externalId: sc.externalId,
        title: sc.title,
        stage: sc.stage,
        type: sc.type,
        contextScore: sc.contextScore,
        contextGaps:
          sc.contextScore < 60
            ? [{ text: "Scope incomplete — AE sync recommended", severity: "high" }]
            : [],
        valueUsd: sc.valueUsd,
        aeName: sc.aeName,
        dueDate:
          sc.type === "quickwin"
            ? new Date(Date.now() + 14 * 86400000)
            : sc.type === "bigbet"
              ? new Date(Date.now() + 35 * 86400000)
              : null,
      })
      .onConflictDoNothing();

    for (const text of sc.reqs) {
      await db.insert(schema.caseRequirements).values({
        caseId: sc.id,
        text,
        status: text.includes("unconfirmed") ? "open" : "confirmed",
      });
    }

    await db.insert(schema.caseEvents).values({
      orgId: DEMO_ORG_ID,
      caseId: sc.id,
      kind: "intake",
      detail: `Seeded ${sc.externalId}`,
      payload: { source: "seed" },
    });
  }

  await db
    .insert(schema.integrations)
    .values({
      orgId: DEMO_ORG_ID,
      provider: "gmail",
      status: "stub",
    })
    .onConflictDoNothing();

  console.log("Seed complete — Applied Scope Demo org with 5 cases.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
