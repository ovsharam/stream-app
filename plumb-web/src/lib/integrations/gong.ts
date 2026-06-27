import crypto from "crypto";

export interface GongWebhookPayload {
  event: string;
  callId: string;
  workspaceId?: string;
  eventTimestamp?: string;
  payload?: {
    call?: {
      id: string;
      title?: string;
      url?: string;
      started?: string;
      duration?: number;
      direction?: string;
      parties?: Array<{
        speakerId: string;
        name?: string;
        userId?: string;
        emailAddress?: string;
      }>;
    };
  };
}

interface GongTranscriptSentence {
  start: number;
  end: number;
  text: string;
  speakerId: string;
}

interface GongTranscriptTopic {
  topic: string;
  sentences: GongTranscriptSentence[];
}

interface GongTranscriptResponse {
  requestId: string;
  callTranscripts: Array<{
    callId: string;
    transcript: GongTranscriptTopic[];
  }>;
}

/** Verify Gong HMAC-SHA256 webhook signature. */
export function verifyGongSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string,
): boolean {
  // Gong sends: "hmac-sha256 <hex-digest>"
  const sig = signatureHeader.startsWith("hmac-sha256 ")
    ? signatureHeader.slice("hmac-sha256 ".length)
    : signatureHeader;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(sig, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

/** Fetch full transcript for a call from the Gong API. */
export async function fetchGongTranscript(callId: string): Promise<string> {
  const key = process.env.GONG_ACCESS_KEY;
  const secret = process.env.GONG_ACCESS_SECRET;
  if (!key || !secret) throw new Error("Gong credentials not configured");

  const token = Buffer.from(`${key}:${secret}`).toString("base64");

  const res = await fetch("https://api.gong.io/v2/calls/transcript", {
    method: "POST",
    headers: {
      Authorization: `Basic ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ filter: { callIds: [callId] } }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Gong transcript fetch failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as GongTranscriptResponse;
  const callData = data.callTranscripts?.[0];
  if (!callData?.transcript?.length) {
    throw new Error(`No transcript data for call ${callId}`);
  }

  // Flatten all sentences to readable text, preserving order
  return callData.transcript
    .flatMap((topic) => topic.sentences.map((s) => s.text))
    .join(" ");
}

/** Fetch call metadata (title, parties) from the Gong API. */
export async function fetchGongCallMeta(callId: string): Promise<{
  title: string;
  aeName?: string;
}> {
  const key = process.env.GONG_ACCESS_KEY;
  const secret = process.env.GONG_ACCESS_SECRET;
  if (!key || !secret) return { title: `Call ${callId}` };

  const token = Buffer.from(`${key}:${secret}`).toString("base64");

  const res = await fetch(
    `https://api.gong.io/v2/calls?ids=${encodeURIComponent(callId)}`,
    {
      headers: { Authorization: `Basic ${token}` },
      signal: AbortSignal.timeout(10_000),
    },
  );

  if (!res.ok) return { title: `Call ${callId}` };

  const data = (await res.json()) as {
    calls?: Array<{ metaData?: { title?: string }; parties?: Array<{ name?: string; affiliation?: string }> }>;
  };

  const call = data.calls?.[0];
  const title = call?.metaData?.title ?? `Call ${callId}`;
  const aeName = call?.parties?.find((p) => p.affiliation === "Internal")?.name;

  return { title, aeName };
}
