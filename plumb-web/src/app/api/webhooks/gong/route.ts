import { NextResponse, type NextRequest } from "next/server";
import { verifyGongSignature, fetchGongTranscript, fetchGongCallMeta, type GongWebhookPayload } from "@/lib/integrations/gong";
import { extractCaseFromText } from "@/lib/ai/intake";
import { scoreCaseContext } from "@/lib/ai/context-score";
import { createCase, nextExternalId, updateContextScore } from "@/lib/db/cases";

// Gong expects a fast 200. Heavy work runs as a detached promise.
// In production, swap this for a queue (Upstash QStash, etc.) if >10s is needed.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Signature check — enforced when GONG_WEBHOOK_SECRET is set
  const webhookSecret = process.env.GONG_WEBHOOK_SECRET;
  if (webhookSecret) {
    const sig = req.headers.get("X-Gong-Webhook-Signature") ?? "";
    if (!sig || !verifyGongSignature(rawBody, sig, webhookSecret)) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  let event: GongWebhookPayload;
  try {
    event = JSON.parse(rawBody) as GongWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Only care about completed calls
  if (event.event !== "call.completed") {
    return NextResponse.json({ ok: true, skipped: event.event });
  }

  const callId = event.callId ?? event.payload?.call?.id;
  if (!callId) {
    return NextResponse.json({ error: "Missing callId" }, { status: 400 });
  }

  // Org routing: single-tenant for now via GONG_ORG_ID env var.
  // Multi-tenant: store a per-org Gong workspace → orgId mapping table.
  const orgId = process.env.GONG_ORG_ID;
  if (!orgId) {
    console.warn("[gong webhook] GONG_ORG_ID not set — dropping event");
    return NextResponse.json({ ok: true, dropped: "no org" });
  }

  // Return 200 immediately; intake runs in background
  processCall(orgId, callId, event).catch((err) =>
    console.error("[gong webhook] processCall error", err),
  );

  return NextResponse.json({ ok: true, callId });
}

async function processCall(
  orgId: string,
  callId: string,
  _event: GongWebhookPayload,
) {
  // 1. Fetch transcript + call meta in parallel
  const [transcript, meta] = await Promise.all([
    fetchGongTranscript(callId),
    fetchGongCallMeta(callId),
  ]);

  // Prepend call title so the AI extractor has strong context signal
  const rawText = `${meta.title}\n\n${transcript}`;

  // 2. Extract structured case from transcript
  const extracted = await extractCaseFromText(rawText);

  // 3. Create case
  const externalId = await nextExternalId(orgId);
  const created = await createCase({
    orgId,
    clientName: extracted.client,
    externalId,
    title: extracted.title || meta.title,
    stage: "intake",
    contextScore: extracted.initialContextScore,
    valueUsd: extracted.valueUsd ?? 0,
    aeName: extracted.aeName ?? meta.aeName ?? null,
    requirements: extracted.requirements,
  });

  // 4. Run a proper context score pass (the intake score is a fast first pass)
  const scored = await scoreCaseContext({
    externalId,
    title: created.title,
    clientName: extracted.client,
    requirements: extracted.requirements,
  });

  await updateContextScore({
    orgId,
    caseId: created.id,
    score: scored.score,
    gaps: scored.gaps,
    aeSyncNeeded: scored.aeSyncNeeded,
  });

  console.log(
    `[gong webhook] created case ${externalId} (score ${scored.score}/100)`,
  );
}
