/**
 * Synthetic demo dataset for Vapi — voice AI platform for developers.
 * Simulates what Vapi's internal Linear board, Slack channels, GitHub
 * releases, and Notion docs would look like, so FDEs can assess
 * Vapi-integration deals against real product knowledge.
 */

import type { ConnectorChunk } from '../connectors/types'

const now = Date.now()
const daysAgo = (d: number) => now - d * 86_400_000

export const VAPI_CHUNKS: ConnectorChunk[] = [

  // ── Linear: shipped features ──────────────────────────────────────────────

  {
    contentType: 'issue', sourceId: 'linear-VP-312', title: 'Squads GA — multi-agent call orchestration',
    sourceUrl: 'https://linear.app/vapi/issue/VP-312',
    timestamp: daysAgo(18),
    content: `[Linear VP-312] Squads GA — multi-agent call orchestration
Team: Platform | Status: Done | Labels: feature, shipped

Squads are now generally available. A Squad is a collection of specialized assistants that hand off control to each other mid-conversation, each handling a narrow task slice.

Core mechanism: the first Squad member takes the call. When its handoff conditions are met, it invokes an assistantHandoff tool to transfer context + control to the next member. Context window from the current assistant is summarized and passed.

Why this beats a single large assistant:
- Focused instructions reduce hallucination rate (~40% reduction in internal tests)
- Smaller context = lower token cost per turn
- Faster response: smaller prompt = lower LLM latency

Configuration:
- Squad defined as { members: [...], memberOverrides: {...} }
- Each member: { assistant | assistantId, assistantOverrides?, handoffTools }
- First member initiates the call automatically
- Overrides: memberOverrides applies to ALL members; assistantOverrides applies per-member

Constraints:
- Squad members should have 1–3 goals max. Wide-scope members defeat the purpose.
- Minimum squad size — don't use Squads if a single assistant can handle the flow. Squads add orchestration overhead.
- Context summary at handoff is LLM-generated and lossy — critical context should be explicitly extracted via variables before handoff, not relied on from summary.
- Member count: no hard limit documented, but >5 members significantly increases handoff latency chain.
- You cannot do a handoff back to a previous member in the same call (no cycle support). Build linear or tree-shaped flows.

Comments:
  [Jordan Lee, PM]: Squads unlocks the IVR-replacement use case. Intake → triage → scheduling → follow-up as separate specialized assistants.
  [Dev Patel, Eng]: Important: if a Squad member crashes (vapifault), the call ends — there is no automatic fallback to a different member. Design flows to keep each member simple.`,
  },

  {
    contentType: 'issue', sourceId: 'linear-VP-341', title: 'HIPAA compliance tier — GA',
    sourceUrl: 'https://linear.app/vapi/issue/VP-341',
    timestamp: daysAgo(30),
    content: `[Linear VP-341] HIPAA compliance tier GA
Team: Compliance | Status: Done | Labels: feature, shipped, compliance

HIPAA-compliant deployment is now available as a paid add-on at $2,000/month.

What's included:
- BAA (Business Associate Agreement) execution
- Call recordings stored in HIPAA-compliant infrastructure (US-only data residency)
- PHI handling in transcripts: automatic PII detection and masking option
- Audit logs: all API calls, data access, and configuration changes logged with 1-year retention
- Access controls: RBAC + SSO required (enterprise tier only)

What HIPAA compliance does NOT cover:
- The LLM itself — PHI sent to OpenAI/Anthropic/Google is governed by those providers' BAAs, which must be secured separately. Vapi does not manage your OpenAI BAA.
- Voicemail recordings where patient leaves a message — content is captured but classification as PHI is customer's responsibility.
- Third-party telephony providers (Twilio, Vonage, Telnyx) — customer must have BAAs with those providers independently.

Constraints:
- HIPAA add-on requires Scale plan ($2,000/month is on top of Scale contract, not available on Build tier).
- Cannot use ElevenLabs on HIPAA deployments — ElevenLabs does not offer a BAA. Use Azure TTS or OpenAI TTS (with OpenAI BAA) instead.
- Knowledge base (RAG) on HIPAA deployments: files stored in Vapi's HIPAA-compliant storage, but external RAG sources queried at runtime are customer's responsibility.
- Zero Data Retention add-on ($1,000/month) can be combined with HIPAA for maximum data minimization — transcripts and recordings deleted in real time, never persisted.

Comments:
  [Sarah Chen, Legal]: Customers often assume HIPAA add-on covers everything. It does NOT replace their own LLM provider BAA. This is the #1 compliance misconception we see.
  [Jordan Lee, PM]: Healthcare, therapy, and insurance verticals are our fastest-growing segment. This was the unlock.`,
  },

  {
    contentType: 'issue', sourceId: 'linear-VP-298', title: 'Bring-your-own LLM endpoint (BYOK + custom models)',
    sourceUrl: 'https://linear.app/vapi/issue/VP-298',
    timestamp: daysAgo(45),
    content: `[Linear VP-298] Custom LLM endpoint support — BYOK and fine-tuned models
Team: Platform | Status: Done | Labels: feature, shipped

Assistants can now point to any OpenAI-compatible endpoint as their LLM. This enables:
1. Bring-your-own API key: use your own OpenAI/Anthropic key, provider costs flow through your account, not Vapi.
2. Fine-tuned models: point to a LoRA-tuned or fully fine-tuned model hosted on Together.ai, Anyscale, Fireworks, Replicate.
3. Self-hosted: point to vLLM, Ollama, or any OpenAI-compatible server you operate.
4. Azure OpenAI: use your Azure OpenAI deployment directly.

Configuration: model.provider = "custom-llm", model.url = "https://your-endpoint.com/v1"

Constraints:
- Custom endpoint must implement the OpenAI Chat Completions streaming API (/v1/chat/completions with stream: true). Non-streaming endpoints are not supported.
- Function calling must be supported by the custom endpoint — if your fine-tuned model doesn't support tool_calls, Vapi tool use (function calling, handoffs) will not work.
- Custom LLM endpoints are NOT eligible for Vapi's vapifault billing protection. If your endpoint is down, you are charged for the failed call.
- Latency: Vapi's sub-600ms guarantee does not apply to custom endpoints. If your model responds in 3s, that's what users experience.
- BYOK only eliminates model cost from Vapi's bill. You still pay Vapi's platform cost ($0.05/min on Build tier).

Comments:
  [Dev Patel, Eng]: The streaming requirement catches people off-guard. We should make this more prominent in docs.
  [Jordan Lee, PM]: Fine-tuned model on a voice agent that already knows your exact product terminology is a killer combination. Call deflection rates go up significantly.`,
  },

  {
    contentType: 'issue', sourceId: 'linear-VP-327', title: 'Voicemail detection + leave-message flow',
    sourceUrl: 'https://linear.app/vapi/issue/VP-327',
    timestamp: daysAgo(22),
    content: `[Linear VP-327] Voicemail detection and leave-a-message flow for outbound calls
Team: Telephony | Status: Done | Labels: feature, shipped

Outbound calls can now automatically detect voicemail and either leave a message or hang up.

Configuration on the assistant: voicemailDetection: { enabled: true, provider: "twilio" | "vapi", voicemailMessage: "...", timeoutSeconds: 30 }

Behavior:
- When voicemail is detected, assistant speaks the voicemailMessage and ends the call
- If no message configured: call hangs up silently on voicemail detection
- Detection is typically within 3–5 seconds of call connect

Provider options:
- twilio: Uses Twilio's AMD (Answering Machine Detection). More reliable but adds ~2–3 seconds of latency to call connect for all calls (detection runs on every call).
- vapi: Vapi's own audio-based detection. Faster (no added latency on live calls) but lower accuracy (~85% vs Twilio's ~95%).

Constraints:
- Voicemail detection is outbound-only. Inbound calls do not use AMD.
- False positives (live person detected as voicemail) rate: ~2% with Twilio AMD, ~5% with Vapi detection. For sensitive outbound use cases, accept the Twilio latency tradeoff.
- Voicemail message is spoken by the assistant's configured TTS voice — it is NOT a pre-recorded audio file.
- Cannot detect voicemail on calls made with free Vapi numbers (provider limitation).
- The leave-message content is limited by TTS: if the message is >500 characters, it may be cut off on some voicemail systems that have short beep windows.

Comments:
  [Casey Kim, Eng]: Twilio AMD is the right choice for anything healthcare or financial services. False positive on a live patient call = bad experience.`,
  },

  {
    contentType: 'issue', sourceId: 'linear-VP-355', title: 'Knowledge base / RAG for assistants — GA',
    sourceUrl: 'https://linear.app/vapi/issue/VP-355',
    timestamp: daysAgo(12),
    content: `[Linear VP-355] Knowledge base (RAG) for assistants — GA
Team: AI | Status: Done | Labels: feature, shipped

Assistants can now be configured with a knowledge base — uploaded documents that the assistant retrieves from during the call to answer questions.

Supported file types: PDF, DOCX, TXT, MD. Max file size: 50MB per file. Max total knowledge base size: 1GB per assistant.

How it works: uploaded files are chunked and embedded at upload time. During the call, the assistant's system prompt + the user's latest message is used to retrieve the top-K relevant chunks, which are injected into the context window before the LLM generates a response.

Configuration: assistant.knowledgeBase = { fileIds: [...], topK: 5 (default) }

Constraints:
- Retrieval adds ~100–200ms latency per turn that requires a knowledge base lookup. Plan for this in latency-sensitive deployments.
- Knowledge base content is retrieved per-turn, not pre-loaded into context. Very long documents don't penalize you on every turn — only relevant chunks are pulled.
- File size limit: 50MB per file. Large PDFs with many images may hit this limit quickly. Text-heavy PDFs are fine.
- Not supported on Zero Data Retention: if ZDR is enabled, knowledge base files cannot be stored in Vapi (no persistence). External RAG via function calling is the alternative.
- Knowledge base is not updated mid-call. Changes to files take effect on the next call.
- Supported languages: retrieval works best in English. Multi-language retrieval quality degrades significantly for non-Latin scripts.

Comments:
  [Jordan Lee, PM]: This is the unlock for customer support agents that need to know a company's product catalog, FAQ, and return policies without fine-tuning.
  [Dev Patel]: topK default is 5. For complex product catalogs, increasing to 10–15 improves accuracy but adds 50ms latency per lookup.`,
  },

  {
    contentType: 'issue', sourceId: 'linear-VP-301', title: 'Call transfer to human agent (warm + cold transfer)',
    sourceUrl: 'https://linear.app/vapi/issue/VP-301',
    timestamp: daysAgo(60),
    content: `[Linear VP-301] Call transfer to human agent — warm and cold transfer
Team: Telephony | Status: Done | Labels: feature, shipped

Assistants can now transfer calls to human agents via phone number or SIP URI.

Transfer types:
- Cold transfer: assistant says goodbye message, call is transferred immediately, assistant disconnects.
- Warm transfer: assistant stays on the line while the human agent picks up, introduces the caller and context, then disconnects.

Configuration: transferCall tool in assistant tools, or programmatic via PATCH /call/{id}

Destination types:
- PSTN phone number (E.164 format)
- SIP URI (sip:agent@yourdomain.com)

Constraints:
- Warm transfer requires the destination to support 3-way calling. Not all SIP endpoints or telephony providers do.
- Transfer latency: ~2–4 seconds from transfer initiation to destination ringing. Brief silence is normal during this window — the assistant should say something to fill it.
- You cannot transfer back to Vapi from the human agent's side. Transfer is one-way.
- Call recording: if recording is enabled, the recording continues on the transferred leg if you use Twilio. With Vonage or Telnyx, recording stops at transfer point.
- Warm transfer context: the assistant can speak a brief context summary to the agent before disconnecting, but the context window is not passed to the agent's system.
- Transfer to a Vapi phone number (to a different Vapi assistant): supported but counts as a new outbound call and is billed as such.`,
  },

  // ── Linear: active / in-progress ─────────────────────────────────────────

  {
    contentType: 'issue', sourceId: 'linear-VP-388', title: 'Persistent memory across calls',
    sourceUrl: 'https://linear.app/vapi/issue/VP-388',
    timestamp: daysAgo(6),
    content: `[Linear VP-388] Persistent memory across calls — cross-session context
Team: AI | Status: In Progress | Labels: feature

Problem: today, each Vapi call starts with zero knowledge of previous calls with the same customer. Returning customers have to re-explain context. High-volume outbound campaigns re-introduce themselves to people they've called before.

Proposed: persistent memory store per customer phone number (or custom customer ID). After each call, a memory summary is written to the store. At the start of the next call, relevant memories are retrieved and injected into the system prompt.

Status: architecture complete, in implementation. ETA for beta: 4 weeks.

What it will cover:
- Opt-in per assistant (not on by default)
- Memory written at call-end via end-of-call webhook internally
- Retrieval is semantic (embedding similarity) not just lookup

What it will NOT cover (at launch):
- Memory shared across assistants in a Squad (each assistant has its own memory store)
- Manual memory editing via API (read-only at launch)
- Memory for web-based calls (phone calls only at launch)
- HIPAA-compliant memory storage (requires additional architecture)

Comments:
  [Jordan Lee, PM]: This is the #1 feature request from our enterprise customers doing outbound campaigns. "My agent called the same person 4 times this week and re-introduced itself each time."
  [Casey Kim, Eng]: The hard part is not the storage — it's the retrieval quality. If we inject the wrong memory, it's worse than no memory.`,
  },

  {
    contentType: 'issue', sourceId: 'linear-VP-371', title: 'Custom STT vocabulary / hotwords',
    sourceUrl: 'https://linear.app/vapi/issue/VP-371',
    timestamp: daysAgo(15),
    content: `[Linear VP-371] Custom vocabulary and hotword boosting for STT
Team: Platform | Status: In Progress | Labels: feature, enhancement

Problem: domain-specific terms (product names, medication names, brand names, technical jargon) are frequently mis-transcribed by general STT models. "Vapi" gets transcribed as "Wabi", "Bapi", "Happy". Healthcare terms especially suffer.

Proposed: allow assistants to configure a custom vocabulary list that the STT provider will boost during transcription.

Provider support:
- Deepgram: keyterms parameter (already supported in Deepgram API, just not exposed in Vapi config)
- Google STT: speechContexts phrases
- AssemblyAI: word_boost parameter
- Gladia: custom_vocabulary
- ElevenLabs STT (new): custom terms

ETA: 2 weeks for Deepgram + AssemblyAI support. Google and Gladia in the following sprint.

Constraints at launch:
- Max vocabulary size: ~500 terms (provider limit)
- Case-sensitive matching on some providers (Deepgram is case-insensitive, AssemblyAI is case-sensitive)
- Hotword boosting increases recall of listed terms but can reduce overall accuracy on non-listed words — use sparingly

Comments:
  [Dev Patel, Eng]: This is the most common STT complaint we get. Especially from healthcare customers where a mis-transcribed medication name is a patient safety issue.`,
  },

  // ── Linear: limitations / won't fix ───────────────────────────────────────

  {
    contentType: 'issue', sourceId: 'linear-VP-249', title: 'Free Vapi numbers: no international outbound',
    sourceUrl: 'https://linear.app/vapi/issue/VP-249',
    timestamp: daysAgo(90),
    content: `[Linear VP-249] Free Vapi numbers cannot make international calls — not changing
Team: Telephony | Status: Won't Fix | Labels: limitation

Free Vapi phone numbers (provisioned directly by Vapi at no extra cost) cannot call international numbers. Attempts return a carrier rejection.

Root cause: free numbers are provisioned on a shared carrier pool with US-only outbound routing enabled. International routing is not economically viable for free-tier accounts.

Decision: Won't fix for free tier. International calling is a Scale plan feature using customer-provided Twilio/Vonage/Telnyx numbers.

Workaround: import your own number from Twilio, Vonage, or Telnyx. Once imported, Vapi uses that number's routing capabilities — if your Twilio account has international calling enabled and funded, the Vapi call will go through.

Also applies: free Vapi numbers have a daily outbound call limit (approximately 20 calls/day per number). This limit is not documented publicly and varies based on carrier pool health.

Comments:
  [Jordan Lee, PM]: Standard answer for international: bring your own number. The carrier cost structure makes free international calls unsustainable.
  [CS Lead]: Any customer asking about calling EU or LATAM numbers — point them immediately to Twilio import, do not let them burn time trying to configure free numbers.`,
  },

  {
    contentType: 'issue', sourceId: 'linear-VP-266', title: 'Batch outbound: no per-customer assistant overrides',
    sourceUrl: 'https://linear.app/vapi/issue/VP-266',
    timestamp: daysAgo(75),
    content: `[Linear VP-266] Batch outbound call API: cannot provide per-customer assistant overrides
Team: Telephony | Status: Known Limitation | Labels: limitation

When creating batch outbound calls (POST /call with customers: [...] array), all customers in the batch share the same assistant configuration. You cannot set different system prompts, different voices, or different tool configurations per customer number in a single API call.

This is documented as: "To provide customer specific assistant overrides, please call the endpoint separately for each destination number."

Impact: high-volume personalized outbound campaigns must make one API call per customer, not one batch call. At 10,000 customers, that's 10,000 individual API calls.

Rate limit: the /call endpoint is rate-limited at 1,000 requests/minute on Scale plan. 10,000 calls requires 10+ minutes to dispatch.

Workaround: use the schedulePlan parameter (earliestAt/latestAt window) to stagger dispatches within the allowed rate limit window, with server-side queuing on your end.

Will this be fixed? Not in the near term. The batch API was designed for uniform campaigns. Per-customer override support requires a new data model. On roadmap but not scheduled.

Comments:
  [Casey Kim, Eng]: For personalization use cases — inject customer context via the system prompt template (using variables) rather than overrides. That way you can still use the batch API for dispatch and pass customer-specific data via metadata.
  [Jordan Lee, PM]: The variable injection pattern is the recommended approach for personalization at scale.`,
  },

  {
    contentType: 'issue', sourceId: 'linear-VP-283', title: 'AssemblyAI STT: English only — not changing',
    sourceUrl: 'https://linear.app/vapi/issue/VP-283',
    timestamp: daysAgo(80),
    content: `[Linear VP-283] AssemblyAI transcription provider: English only
Team: Platform | Status: Won't Fix | Labels: limitation

AssemblyAI's Universal-2 model (which Vapi uses) supports English only. Attempts to use AssemblyAI with Spanish, French, Portuguese, or other non-English content result in severely degraded transcription quality (not an error — just wrong output).

Vapi does not block non-English calls on AssemblyAI. The call proceeds but transcription will be incorrect.

Decision: Not adding a language guard. Customers are responsible for choosing the right STT provider for their language requirements.

Language provider recommendations:
- English only, highest accuracy: AssemblyAI or Deepgram Nova 3
- Multi-language (auto-detect): Deepgram Nova 2/3 with lang="multi", Google STT with "multilingual", Gladia
- 100+ language coverage: Google STT (125+ languages), Gladia (110+)
- HIPAA + multi-language: Azure STT (HIPAA BAA available, 125+ languages, but no auto-detection)

For any multilingual deployment: you must also explicitly list supported languages in the assistant's system prompt. Auto-detection on the STT side does not automatically adjust the LLM's response language.

Comments:
  [Dev Patel]: We get support tickets weekly from customers who set AssemblyAI and then get garbage transcriptions on Spanish calls. The docs need a bigger warning.`,
  },

  {
    contentType: 'issue', sourceId: 'linear-VP-310', title: 'Build plan: 14-day data retention hard limit',
    sourceUrl: 'https://linear.app/vapi/issue/VP-310',
    timestamp: daysAgo(55),
    content: `[Linear VP-310] Build plan data retention: 14 days for calls, 30 days for chat
Team: Platform | Status: Won't Fix | Labels: limitation

Build (usage-based) plan data retention:
- Call recordings: deleted after 14 days
- Call transcripts: deleted after 14 days
- Chat/message logs: deleted after 30 days

There is no way to extend retention on the Build plan. This is enforced at the infrastructure level, not just a policy.

Decision: Won't change. The economics of storing call recordings at $0.05/min pricing don't support indefinite retention.

Scale plan: custom retention configured in contract. Customers can specify 90 days, 1 year, or custom. Most enterprise contracts use 1-year retention.

Workarounds for Build tier:
1. End-of-call webhook: Vapi sends a full call summary, transcript, and recording URL at call end. Download and store the recording URL content in your own storage within the 14-day window.
2. Call recording upload: configure recordingUploadUrl on the assistant. Vapi will POST the recording to your S3/GCS bucket in real time at call end.
3. Transcript export: pull transcripts via GET /call/{id}/transcript before the 14-day expiry.

Comments:
  [Jordan Lee, PM]: The recordingUploadUrl pattern is the right answer for any Build-tier customer who needs long-term storage. Works in real-time, no 14-day cliff.
  [CS Lead]: Compliance customers (insurance, healthcare) almost always need >14 days. They need Scale or must use recordingUploadUrl to their own compliant storage.`,
  },

  // ── Slack: #product-eng ───────────────────────────────────────────────────

  {
    contentType: 'message', sourceId: 'slack-vapi-prod-001', title: '#product-engineering',
    timestamp: daysAgo(8),
    content: `[#product-engineering] Thread: ElevenLabs vs Azure for enterprise voice deployments

Jordan Lee: Getting a lot of questions from enterprise prospects: "is ElevenLabs the best voice option?" How should we be steering this?

  ↳ Dev Patel: Depends on what they're optimizing for.
    ElevenLabs: best voice quality, most natural prosody, widest voice library. But: highest added latency (~200-300ms extra vs other TTS), no HIPAA BAA available, not suitable for HIPAA workloads.
    Azure TTS: lower quality than ElevenLabs but still very good, 140+ languages, 400+ voices, HIPAA BAA available, lower latency. Right choice for healthcare/regulated industry.
    OpenAI TTS: mid-tier quality, 50+ languages, HIPAA BAA available (if customer has their own OpenAI HIPAA agreement), good latency.
    PlayHT: good quality, 80+ languages, competitive latency. No HIPAA BAA.
  ↳ Casey Kim: For enterprise outbound sales bots where voice quality is a differentiator — ElevenLabs. For IVR replacement at scale where latency matters more than voice quality — Azure.
  ↳ Jordan Lee: And for HIPAA: Azure is the only real option unless they have their own OpenAI BAA.
  ↳ Dev Patel: One more thing: ElevenLabs voice cloning requires their Creator or higher plan. If the customer wants a custom cloned voice, that's a separate ElevenLabs cost outside of Vapi billing.`,
  },

  {
    contentType: 'message', sourceId: 'slack-vapi-prod-002', title: '#product-engineering',
    timestamp: daysAgo(14),
    content: `[#product-engineering] Thread: latency optimization — what actually moves the needle

Casey Kim: Had a customer complaining about "robotic" conversations. They're seeing ~1200ms response times. What's the real latency breakdown and what can we tell them to fix?

  ↳ Dev Patel: Rough breakdown for a typical call:
    - STT (speech to text): 100–300ms (Deepgram is fastest ~100ms, Whisper is slowest ~400ms+)
    - LLM (first token): 200–600ms (GPT-4o-mini: ~200ms, GPT-4o: ~400ms, Claude Opus: ~700ms+)
    - TTS (first audio): 100–300ms (ElevenLabs: ~300ms, Azure: ~100ms, OpenAI TTS: ~150ms)
    - Network round trips: 50–150ms
    Total: 450–1350ms is realistic range.
  ↳ Casey Kim: So 1200ms means they're probably using a slow LLM + ElevenLabs.
  ↳ Dev Patel: Exactly. Fastest combination: Deepgram Nova 3 (STT) + GPT-4o-mini (LLM) + Azure TTS or OpenAI TTS. Gets you under 600ms consistently.
  ↳ Jordan Lee: What about the system prompt? Long prompts = more tokens = slower LLM first-token time.
  ↳ Dev Patel: Yes. Keep system prompts under 1,000 tokens for latency-sensitive deployments. Use Squads to split large prompts across specialized assistants rather than one giant prompt. Also: turn off knowledge base retrieval for turns that don't need it (we don't yet have per-turn KB toggle, that's VP-391).
  ↳ Casey Kim: For the 1200ms customer: switch LLM to GPT-4o-mini, switch TTS to Azure, see if they can drop ElevenLabs. Should get them under 700ms without any other changes.`,
  },

  {
    contentType: 'message', sourceId: 'slack-vapi-prod-003', title: '#product-engineering',
    timestamp: daysAgo(20),
    content: `[#product-engineering] Thread: STIR/SHAKEN attestation and spam labeling — enterprise outbound concern

Jordan Lee: Multiple enterprise customers asking about "SPAM LIKELY" showing up on their outbound calls. What's the actual situation with caller ID reputation?

  ↳ Casey Kim: STIR/SHAKEN is the framework but it doesn't prevent spam labels. Attestation levels:
    - A (Full): we originated the call, we know who it's from, we're sure they're authorized. Best case.
    - B (Partial): we know where the call came from but can't fully vouch for the origin.
    - C (Gateway): we just passed it through, no knowledge of origin. Worst case.
  ↳ Dev Patel: Free Vapi numbers typically get B or C attestation. Customer-provided Twilio numbers with CNAM registration can get A attestation.
  ↳ Jordan Lee: So what actually causes SPAM LIKELY?
  ↳ Casey Kim: It's mostly based on calling behavior, not attestation alone. Calling the same numbers repeatedly in short windows, high abandoned call rate, numbers that have been reported by users. The carrier analytics companies (First Orion, Hiya, Transaction Network Services) maintain reputation databases.
  ↳ Dev Patel: For enterprise outbound: (1) use dedicated numbers, not shared pool numbers. (2) Register with First Orion and Hiya business caller databases — this gets the business name displayed instead of the number. (3) CNAM registration on the number. (4) Don't blast the same number multiple times in 24h.
  ↳ Jordan Lee: And if they're already labeled?
  ↳ Casey Kim: Remediation is slow (weeks). Best to use a fresh number with a new registration rather than trying to clean the existing one. This is a known carrier behavior issue — Vapi can't override it.`,
  },

  {
    contentType: 'message', sourceId: 'slack-vapi-eng-001', title: '#engineering',
    timestamp: daysAgo(25),
    content: `[#engineering] Thread: vapifault vs providerfault billing protection — what's covered

Dev Patel: Getting questions from FDEs about billing when calls fail. What's the exact rule?

  ↳ Casey Kim: Rule is simple:
    vapifault = Vapi's infrastructure failed (worker crash, transport connection failure, database error). Customer NOT charged.
    providerfault = A third-party provider (OpenAI, Deepgram, ElevenLabs, etc.) had an outage or returned a 5xx error. Customer IS charged (partial charge for the portion of the call that succeeded).
    pipeline-error-* = Almost always a credential issue or quota exhaustion on the customer's BYOK keys. Customer IS charged.
  ↳ Dev Patel: What about network errors mid-call?
  ↳ Casey Kim: WebSocket disconnects mid-call: if it's on Vapi's WebSocket infrastructure = vapifault, not charged. If it's on the customer's server-url endpoint that disconnected = customer is charged (they broke the server-side connection).
  ↳ Jordan Lee: So the practical rule for FDEs: if a customer says "calls are failing and I'm being charged" — first question is what's the call_ended_reason code. If it's vapifault, they're not being charged. If it's providerfault, check the provider's status page first.
  ↳ Dev Patel: Also: rate limit errors from LLM providers (OpenAI 429) are providerfault. Customers using BYOK who hit their own OpenAI rate limit are charged for the failed call. Need to ensure adequate rate limits on their LLM provider account.`,
  },

  {
    contentType: 'message', sourceId: 'slack-vapi-cs-001', title: '#customer-success',
    timestamp: daysAgo(10),
    content: `[#customer-success] Enterprise deal feedback — Q2 2026 voice AI deployment patterns

Morgan Rivera (CS): Synthesizing Q2 enterprise call notes. Recurring themes:

1. CONCURRENCY LIMITS: #1 friction point at scale. Build tier (10 concurrent calls) is consistently hit by customers doing outbound campaigns. Common ask: burst concurrency for campaign windows without committing to Scale contract. We don't offer this today.

2. LATENCY EXPECTATIONS: most customers expect sub-300ms. Reality is 500–800ms for good configurations. Managing expectations early is critical. Show them the Deepgram + GPT-4o-mini + Azure TTS combo as the baseline.

3. SQUAD COMPLEXITY: customers are over-engineering Squads. 6-8 member Squads with bidirectional handoffs. Need clearer guidance: keep Squads to 3-4 linear members max.

4. COMPLIANCE MISCONCEPTIONS: healthcare customers think HIPAA add-on covers OpenAI/ElevenLabs. Multiple deals stalled when legal discovered they need separate BAAs with every provider in the stack.

5. OUTBOUND SPAM LABELS: 3 enterprise prospects mentioned this as a reason to avoid outbound AI calling entirely. They've been burned by other vendors. Need a clearer answer on what we do for reputation management.

6. KNOWLEDGE BASE ACCURACY: customers expect KB RAG to work like a trained model. Reality is retrieval-based — quality depends on chunk quality, document structure, and the query. Poorly formatted PDFs with lots of tables/images underperform significantly.

  ↳ Jordan Lee: Adding items 1, 3, 4, and 5 to Q3 product priorities.`,
  },

  // ── GitHub releases ────────────────────────────────────────────────────────

  {
    contentType: 'release', sourceId: 'github-release-vapi-0.42.0', title: 'Vapi API v0.42.0',
    sourceUrl: 'https://github.com/VapiAI/server-sdk-typescript/releases/tag/0.42.0',
    timestamp: daysAgo(12),
    content: `Release: Vapi API v0.42.0

## Knowledge Base GA

Knowledge base (RAG) for assistants is now generally available.

### Configuration
\`\`\`json
{
  "assistant": {
    "knowledgeBase": {
      "provider": "canonical",
      "fileIds": ["file_abc123", "file_def456"],
      "topK": 5
    }
  }
}
\`\`\`

### Supported file types
- PDF (.pdf), max 50MB per file
- Word documents (.docx), max 50MB per file
- Plain text (.txt, .md), max 50MB per file
- Maximum total knowledge base size: 1GB

### Known limitations
- Retrieval quality degrades for documents with heavy table/image content
- Not compatible with Zero Data Retention add-on
- Multi-language retrieval performs significantly better in English
- topK max value: 20 (higher values don't improve accuracy and add latency)

## Squad improvements
- Fixed: Squad handoff tool incorrectly reusing parent assistant's voice config when memberOverrides was not set
- Added: assistantId support in Squad members (previously only inline assistant definitions)
- Squad member limit: now enforced at 10 members per Squad (soft limit, contact support for exceptions)

## Outbound calling
- Added: voicemailDetection.provider option ("twilio" | "vapi")
- Fixed: schedulePlan calls were not fetching latest assistant version at fire time in all edge cases
- Added: STIR/SHAKEN attestation level exposed on call object (call.attestation: "A" | "B" | "C")

## Bug fixes
- Fixed: ElevenLabs TTS returning 503 errors not correctly classified as providerfault (were incorrectly being classified as vapifault)
- Fixed: Custom LLM endpoints returning non-standard error formats causing call to end with ambiguous ended_reason
- Fixed: Knowledge base retrieval happening even on turns where user said only "yes", "no", "ok" (added minimum token threshold for KB retrieval trigger)`,
  },

  {
    contentType: 'release', sourceId: 'github-release-vapi-0.40.0', title: 'Vapi API v0.40.0',
    sourceUrl: 'https://github.com/VapiAI/server-sdk-typescript/releases/tag/0.40.0',
    timestamp: daysAgo(35),
    content: `Release: Vapi API v0.40.0

## Squads GA

Multi-agent call orchestration is now generally available.

### What's new
- Squad configuration via POST /squad endpoint
- Member overrides: apply config changes to all squad members at once
- Assistant overrides: per-member config changes without modifying the underlying saved assistant
- Handoff tool: \`transferCall\` tool type with \`destination.type = "assistant"\`
- Context passing: structured data extraction via variables before handoff

### Breaking changes
- Removed: \`squad.pipeline\` (deprecated since 0.38.0). Use \`squad.members\` array.
- Renamed: \`assistantHandoff\` tool → \`transferCall\` tool with \`destination.type = "assistant"\`

## HIPAA compliance tier
- HIPAA add-on now available at $2,000/month (Scale plan required)
- BAA execution flow added to dashboard
- PII masking in transcripts (opt-in): masks phone numbers, SSNs, DOBs in stored transcripts
- Audit log export: GET /audit-logs endpoint for HIPAA customers

## Voicemail detection
- New: voicemailDetection configuration on assistant
- Supported providers: "twilio" (AMD) and "vapi" (audio-based)
- Call ended reason added: customer-did-not-answer-machine-detection-voicemail

## Bug fixes
- Fixed: warm transfer occasionally disconnecting the original caller before agent picked up
- Fixed: recording not stopping correctly when call was transferred to SIP URI
- Fixed: Squad member 2+ not inheriting global memberOverrides when member was defined by assistantId`,
  },

  // ── Notion docs ───────────────────────────────────────────────────────────

  {
    contentType: 'doc', sourceId: 'notion-vapi-voice-provider-guide', title: 'Voice Provider Selection Guide',
    timestamp: daysAgo(20),
    content: `Voice Provider Selection Guide — Vapi Internal FDE Reference

# Choosing a TTS Provider

## ElevenLabs
Best for: Consumer-facing voice agents where voice quality is a differentiator. Creative use cases.
Latency: +200–300ms vs other providers
Languages: 30+
HIPAA: NO BAA available. Cannot use for HIPAA workloads.
Voice cloning: Yes (requires ElevenLabs Creator plan or above, billed directly to ElevenLabs account)
Pricing: Highest per-character cost of all providers

## Azure TTS
Best for: Enterprise / regulated industry. Multilingual. HIPAA workloads.
Latency: ~100ms (fastest)
Languages: 140+, 400+ voices
HIPAA: BAA available
Voice cloning: Azure Custom Neural Voice (enterprise tier, separate licensing)
Notes: Default choice for healthcare and financial services.

## OpenAI TTS
Best for: Balanced quality/latency. Customers already using OpenAI for LLM.
Latency: ~150ms
Languages: 50+
HIPAA: HIPAA BAA available from OpenAI (customer must obtain separately from OpenAI)
Voices: 6 built-in voices. No custom voice cloning.

## PlayHT
Best for: Mid-tier quality, wide language coverage, competitive pricing.
Latency: ~150–200ms
Languages: 80+
HIPAA: No BAA available
Voice cloning: Yes (instant cloning with 10-second audio sample)

# Choosing a STT Provider

## Deepgram Nova 3 (recommended default)
Best for: English accuracy, speed, real-time processing. Best latency of all providers (~100ms)
Languages: 30+ (Nova 3), 100+ with Nova 2 Multi
Auto language detection: Yes (Nova 2/3 with lang=multi)
HIPAA: BAA available via Deepgram enterprise
Custom vocabulary: keyterms parameter (coming to Vapi soon)

## Google Cloud STT
Best for: Maximum language coverage.
Languages: 125+
Auto detection: Yes (Multilingual model)
HIPAA: BAA available (Google Workspace)
Latency: ~150ms

## AssemblyAI
Best for: English transcription accuracy. Automatic punctuation, speaker labels.
Languages: ENGLISH ONLY. Do not use for any other language.
Auto detection: No
HIPAA: BAA available (Enterprise tier)
Latency: ~200ms

## Gladia
Best for: Code-switching (user switches languages mid-sentence). Multilingual auto-detection.
Languages: 110+
Auto detection: Yes, including real-time code-switching
HIPAA: No BAA
Latency: ~180ms

# FDE Decision Framework
1. Regulated industry (healthcare, finance with PII)? → Azure TTS + Deepgram or Azure STT. Get HIPAA BAAs from all providers in the stack.
2. Best possible voice quality, English only? → ElevenLabs TTS + Deepgram Nova 3.
3. Lowest latency? → Azure TTS + Deepgram Nova 3 + GPT-4o-mini.
4. Multi-language required? → Deepgram Nova 3 Multi or Google STT + Azure TTS.
5. Code-switching (users switch languages)? → Gladia STT.`,
  },

  {
    contentType: 'doc', sourceId: 'notion-vapi-compliance-guide', title: 'Compliance & HIPAA Implementation Guide',
    timestamp: daysAgo(28),
    content: `Compliance & HIPAA Implementation Guide — Vapi FDE Reference

# HIPAA Stack Requirements

Vapi's HIPAA add-on ($2,000/month on Scale plan) provides:
- BAA with Vapi
- HIPAA-compliant recording and transcript storage
- PII masking option in transcripts
- Audit logs

## What Vapi's BAA does NOT cover

You need separate BAAs with every provider in the call stack:

| Component | Provider | BAA Source |
|---|---|---|
| LLM | OpenAI | OpenAI HIPAA add-on (separate cost, enterprise) |
| LLM | Anthropic | Anthropic BAA (enterprise contract) |
| LLM | Azure OpenAI | Azure Enterprise Agreement |
| TTS | ElevenLabs | NOT AVAILABLE. Cannot use ElevenLabs on HIPAA deployments. |
| TTS | Azure TTS | Azure Enterprise Agreement (same BAA as Azure OpenAI) |
| TTS | OpenAI TTS | Covered by OpenAI BAA |
| STT | Deepgram | Deepgram Enterprise BAA |
| STT | AssemblyAI | AssemblyAI Enterprise BAA |
| STT | Azure STT | Azure Enterprise Agreement |
| Telephony | Twilio | Twilio BAA ($25,000/year add-on) |
| Telephony | Vonage | Vonage HIPAA add-on |

## Zero Data Retention (ZDR)

ZDR add-on ($1,000/month) + HIPAA = maximum data minimization:
- No call recordings stored
- No transcripts stored
- No memory or logs persisted
- Trade-off: no post-call analytics, no debugging transcripts, no knowledge base (KB requires file storage)

ZDR use case: mental health platforms, substance abuse treatment, any situation where storing any call data creates more liability than value.

## Prohibited on HIPAA deployments
- ElevenLabs TTS (no BAA)
- PlayHT TTS (no BAA)
- Gladia STT (no BAA)
- Vapi Knowledge Base with Zero Data Retention enabled simultaneously
- Free Vapi phone numbers (compliance audit trail required, free numbers don't generate per-call compliance records)

## Common Misconceptions
1. "Vapi's HIPAA add-on covers everything" — FALSE. It covers Vapi's infrastructure only.
2. "OpenAI is automatically HIPAA-compliant" — FALSE. Requires separate OpenAI HIPAA add-on at enterprise tier.
3. "Recordings are encrypted so we don't need HIPAA compliance" — FALSE. Encryption alone doesn't satisfy HIPAA. You need BAAs, access controls, and audit logs.`,
  },

  {
    contentType: 'doc', sourceId: 'notion-vapi-scaling-guide', title: 'Scaling & Concurrency Guide',
    timestamp: daysAgo(15),
    content: `Scaling & Concurrency Guide — Vapi FDE Reference

# Concurrency Limits

## Build Plan
- 10 concurrent calls maximum (hard limit, not soft)
- Calls beyond limit return 429 error immediately — they do not queue
- No burst capacity available on Build plan
- Cost: $0.05/min platform fee + provider costs (or $0 provider cost with BYOK)

## Scale Plan
- Custom concurrent call limits (set in contract)
- Reserved capacity: Scale customers have capacity reserved, not shared with Build pool
- Burst headroom: Scale contracts can include % overage allowance above contracted concurrency
- Additional phone lines: $10/line/month for lines beyond base allocation

# Rate Limits (API, not calls)

- POST /call: 1,000 requests/minute on Scale. ~300/minute on Build.
- GET endpoints: 3,000 requests/minute
- POST /file (KB upload): 100 requests/minute

# Designing for Scale

## Outbound campaign dispatch
At 10,000 outbound calls:
- 1,000 calls/minute dispatch rate
- Requires 10+ minutes to dispatch full campaign
- Use schedulePlan.earliestAt / latestAt to distribute across a calling window
- Server-side queue your own dispatch loop — don't send all 10,000 API calls at once

## Concurrency math
10,000 calls × average 5-minute call = 50,000 minutes total
If campaign runs over 2 hours (120 min): peak concurrency = ~400 simultaneous calls
→ Scale contract minimum: 500 concurrent for headroom

## Webhooks at scale
Server-url (webhook) delivery is synchronous to call processing.
If your server URL takes >1000ms to respond, it introduces latency into the call.
Design server-side handlers to respond within 200ms and process async.

# Provider Rate Limits (BYOK)
If using your own OpenAI key:
- GPT-4o: default 500 RPM on OpenAI tier 2. At 100 concurrent calls with 3 turns/minute = 300 RPM. Add buffer.
- GPT-4o-mini: 5,000 RPM on tier 2. Rarely a bottleneck.
- Recommend: separate OpenAI org/project for Vapi calls to avoid rate limits from other workloads.`,
  },
]
