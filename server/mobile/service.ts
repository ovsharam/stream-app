import type { AssistResult } from '../../shared/cluster'
import { parseAssistSections, cleanAssistField, cleanKbExcerpt, formatChatAssistBody } from '../../shared/assistText'
import { buildAttentionDigest, isAttentionQuery } from '../../shared/attentionDigest'
import type { MobileContext, ContextChip } from '../../shared/mobile'
import { assistCluster } from '../cluster/service'
import { getRecentItems } from '../db'
import { getActiveMeeting, getLatestPrediction } from '../cluster/meetingPipeline'
import { getMergedCalendarRailEvents } from '../sources/calendar'
import { retrieveAssistContext } from '../kb/pipeline'
import { getDatapoint } from '../kb/store'
import { getCaptureState } from '../sources/captureStore'
import { getSessionIdFromContext } from '../request-context'
import { queryClaude, isClaudeConnected, ensureClaudeFromEnv } from '../sources/claude'
import { queryGemini, isGeminiConnected, ensureGeminiFromEnv } from '../sources/gemini'
import type { StreamItem } from '../../shared/types'
import { getGraphSignals, getSimIntel, getSimSignals, getSimTranscript, isSimCallActive } from '../sim/engine'
import { prototypeRealEnabled } from '../prototype'

function formatElapsed(startedAt: number): string {
  const mins = Math.max(0, Math.floor((Date.now() - startedAt) / 60000))
  if (mins < 1) return '<1m'
  return `${mins}m`
}

/** Default mobile UX — Acme sim context + canned assist (unchanged from pre-P1). */
function buildLegacyMobileContext(objective: 'discovery' | 'v1_ship'): MobileContext {
  const live = isSimCallActive()
  const v1 = objective === 'v1_ship'
  const recent = getSimTranscript().slice(-4)
  const extracted = getSimSignals()
  const graph = getGraphSignals('acme-corp')
  const intel = getSimIntel()
  const merged = [...extracted, ...graph].slice(0, 5)

  return {
    phase: live ? 'live_call' : 'idle',
    dealId: 'acme-corp',
    dealName: 'Acme Corp',
    meetingTitle: live ? 'Acme Corp — Technical Deep Dive' : undefined,
    elapsed: live ? '18m' : undefined,
    ambientListening: true,
    objective,
    objectiveNote: v1
      ? 'Call shifted discovery → V1 ASAP. Notch re-ranking for minimal Frankfurt config + webhook policy.'
      : 'Discovery mode — mapping requirements and compliance posture.',
    chips: live
      ? ([
          { id: 'c1', type: 'live', content: 'Acme Corp call' },
          ...merged.map((s, i) => ({
            id: `s-${i}`,
            type:
              s.type === 'budget'
                ? ('ok' as const)
                : s.type === 'champion'
                  ? ('soft' as const)
                  : s.type === 'timeline'
                    ? ('neutral' as const)
                    : ('warn' as const),
            content: s.content.length > 38 ? `${s.content.slice(0, 38)}…` : s.content
          }))
        ].slice(0, 5) as ContextChip[])
      : [
          { id: 'c1', type: 'neutral', content: 'Acme Corp · active deal' },
          { id: 'c2', type: 'warn', content: 'EU residency · blocker' }
        ],
    agenda: live
      ? {
          current: 'Frankfurt isolation + webhook retry policy',
          remaining: [
            intel.gap?.content ?? 'Pilot success criteria',
            'IT sign-off path',
            'SCC template send'
          ],
          callGoal: v1 ? 'Scope V1 config for fastest pilot in EU' : 'Close load-bearing compliance questions'
        }
      : null,
    recentTranscript:
      recent.length > 0
        ? recent
        : [
            {
              speaker: 'Jen Lee',
              text: 'How does webhook retry behave when our endpoint is down?'
            },
            {
              speaker: 'Sarah Kim',
              text: 'We need Frankfurt isolation — nothing leaves EU, even retry queues.'
            }
          ]
  }
}

/** Opt-in P1 path — real meeting capture + calendar when NOTCH_PROTOTYPE=1. */
function buildRealMobileContext(objective: 'discovery' | 'v1_ship'): MobileContext {
  const session = getActiveMeeting()
  const calendar = getMergedCalendarRailEvents()
  const liveCal = calendar.find((e) => e.live)
  const nextCal = calendar[0]
  const prediction = getLatestPrediction()

  if (session) {
    const dealName = session.dealHint?.trim() || session.title?.trim() || 'Live call'
    const recentChunks = session.chunks.slice(-6)
    const chips: ContextChip[] = [
      { id: 'live', type: 'live', content: `${dealName} · listening` }
    ]
    for (const [i, sig] of session.signals.slice(-4).entries()) {
      chips.push({
        id: `sig-${i}`,
        type: sig.type === 'budget' ? 'ok' : sig.type === 'blocker' ? 'warn' : 'neutral',
        content: sig.text.length > 40 ? `${sig.text.slice(0, 40)}…` : sig.text
      })
    }

    return {
      phase: 'live_call',
      dealId: session.id,
      dealName,
      meetingTitle: session.title ?? dealName,
      elapsed: formatElapsed(session.startedAt),
      ambientListening: true,
      objective,
      objectiveNote:
        objective === 'v1_ship'
          ? 'Scope for fastest shippable win — confirm constraints before promising dates.'
          : 'Discovery — map requirements, owners, and blockers.',
      chips: chips.slice(0, 5),
      agenda: prediction
        ? {
            current: prediction.sayThis,
            remaining: session.signals.slice(-3).map((s) => s.text),
            callGoal: prediction.followUp || 'Close open technical and scope questions.'
          }
        : session.signals.length > 0
          ? {
              current: session.signals.at(-1)!.text,
              remaining: [],
              callGoal: 'Capture load-bearing unknowns before next steps.'
            }
          : null,
      recentTranscript: recentChunks.map((c) => ({
        speaker: 'Call',
        text: c.text
      }))
    }
  }

  if (liveCal) {
    const title = liveCal.title
    return {
      phase: 'pre_call',
      dealId: liveCal.id,
      dealName: title.split('—')[0]?.trim() || title,
      meetingTitle: title,
      ambientListening: false,
      objective,
      objectiveNote: 'Upcoming call — review feed and prep one question to open with.',
      chips: [{ id: 'upcoming', type: 'neutral', content: title.slice(0, 42) }],
      agenda: null,
      recentTranscript: []
    }
  }

  const idleName = nextCal?.title.split('—')[0]?.trim() || 'No active call'
  return {
    phase: 'idle',
    dealId: nextCal?.id ?? 'idle',
    dealName: idleName,
    meetingTitle: nextCal?.title,
    ambientListening: false,
    objective,
    objectiveNote: 'Start capture with ⌘⇧L when the call begins.',
    chips: [
      {
        id: 'idle',
        type: 'neutral',
        content: nextCal ? `Next: ${nextCal.title.slice(0, 36)}` : '⌘⇧L start · ⌘⇧M ask'
      }
    ],
    agenda: null,
    recentTranscript: []
  }
}

export function buildMobileContext(objective: 'discovery' | 'v1_ship' = 'v1_ship'): MobileContext {
  if (prototypeRealEnabled()) return buildRealMobileContext(objective)
  return buildLegacyMobileContext(objective)
}

function llmRawAnswer(item: StreamItem): string {
  return (item.bodyFull ?? item.body).trim()
}

function parseChatAssist(
  raw: string,
  query: string
): Pick<AssistResult, 'headline' | 'response' | 'sayThis'> {
  const text = raw.trim()
  if (/^(HEADLINE|SUMMARY|RESPONSE|SAY)/im.test(text)) {
    const parsed = parseAssistSections(text, query)
    return { headline: '', response: parsed.response, sayThis: '' }
  }
  return { headline: '', response: formatChatAssistBody(text), sayThis: '' }
}

function parseAssistFromLlm(
  raw: string,
  query: string
): Pick<AssistResult, 'headline' | 'response' | 'sayThis' | 'trustNote' | 'agendaNext'> {
  const parsed = parseAssistSections(raw, query)
  return {
    headline: parsed.headline,
    response: parsed.response,
    sayThis: parsed.sayThis
      ? parsed.sayThis.startsWith('"')
        ? parsed.sayThis
        : `"${parsed.sayThis}"`
      : '',
    trustNote: 'Grounded in live transcript + your knowledge base.',
    agendaNext: undefined
  }
}

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

function llmAvailable(): boolean {
  return (
    isGeminiConnected() ||
    ensureGeminiFromEnv('default') ||
    isClaudeConnected() ||
    ensureClaudeFromEnv('default')
  )
}

function chatFallbackResponse(q: string): AssistResult {
  if (isAttentionQuery(q)) {
    const digest = buildAttentionDigest(getRecentItems(40))
    if (digest) {
      return { query: q, intent: 'general', headline: '', response: digest, sayThis: '', sources: [] }
    }
  }
  return {
    query: q,
    intent: 'general',
    headline: '',
    response:
      "I don't have that data in Notch yet. Connect the relevant source in **Apps** (Gmail, Monday, Google Docs, etc.), or paste the numbers here and I can help you compare.",
    sayThis: '',
    sources: []
  }
}

function isPlanningQuery(q: string): boolean {
  return /\btomorrow\b|\bnext day\b|\bplan my\b|\bplan for\b|\bagenda\b|\bschedule\b|\btop priorit/i.test(
    q
  )
}

function buildChatContextBlock(
  q: string,
  latent: ReturnType<typeof retrieveAssistContext>,
  session: ReturnType<typeof getActiveMeeting>,
  history?: ChatTurn[]
): string {
  const parts: string[] = []
  const planning = isPlanningQuery(q)

  if (history && history.length > 0) {
    parts.push(
      `Conversation so far:\n${history
        .slice(-8)
        .map((t) => `${t.role === 'user' ? 'User' : 'Assistant'}: ${t.content.slice(0, 600)}`)
        .join('\n')}`
    )
  }

  if (session) {
    const transcript = session.chunks
      .slice(-8)
      .map((c) => c.text)
      .join('\n')
    parts.push(
      `Active meeting: ${session.title ?? session.dealHint ?? session.id}\nRecent transcript:\n${transcript || '(no chunks yet)'}`
    )
  }

  if (planning) {
    const calendar = getMergedCalendarRailEvents()
    const tomorrow = calendar.filter((e) => e.dayIndex === 1)
    const today = calendar.filter((e) => e.dayIndex === 0 && !e.ended)
    parts.push(
      `Calendar today:\n${
        today.length
          ? today
              .map((e) => `• ${e.timeLabel} — ${e.title}${e.link ? ' (Meet)' : ''}`)
              .join('\n')
          : '(no remaining events today)'
      }`
    )
    parts.push(
      `Calendar tomorrow:\n${
        tomorrow.length
          ? tomorrow.map((e) => `• ${e.timeLabel} — ${e.title}`).join('\n')
          : '(no events synced for tomorrow — connect calendar in Apps)'
      }`
    )

    try {
      const sid = getSessionIdFromContext()
      const capture = getCaptureState(sid)
      const openReminders = capture.reminders.filter((r) => !r.done)
      if (openReminders.length > 0) {
        parts.push(
          `Open reminders:\n${openReminders
            .slice(0, 12)
            .map((r) => {
              const profile = capture.profiles.find((p) => p.id === r.profileId)?.label ?? r.profileId
              return `• [${profile}] ${r.text} — due ${new Date(r.dueAt).toLocaleString()}`
            })
            .join('\n')}`
        )
      }
    } catch {
      /* no session context */
    }
  }

  const feedItems = getRecentItems(planning ? 40 : 20).filter(
    (i) => !['gemini', 'claude', 'mobile', 'perplexity'].includes(i.source)
  )
  const planningSources = new Set(['gmail', 'slack', 'monday', 'meeting', 'gdocs', 'calcom', 'note'])
  const scopedFeed = planning
    ? feedItems.filter((i) => planningSources.has(i.source))
    : feedItems

  const includeFeed =
    isAttentionQuery(q) ||
    planning ||
    /\b(email|inbox|gmail|monday|calendar|meeting|invite|task|attention|today)\b/i.test(q)
  if (includeFeed && scopedFeed.length > 0) {
    parts.push(
      `Recent items from integrations:\n${scopedFeed
        .slice(0, planning ? 12 : 8)
        .map((i) => {
          const preview = formatChatAssistBody(String(i.bodyFull ?? i.body ?? ''), planning ? 700 : 500)
          return `• [${i.source}] ${i.title}${preview ? `: ${preview}` : ''}`
        })
        .join('\n')}`
    )
  }

  if (latent.chunks.length > 0) {
    parts.push(
      `Knowledge base:\n${latent.chunks
        .slice(0, planning ? 8 : 5)
        .map((c) => {
          const dp = getDatapoint(c.datapointId)
          const body = formatChatAssistBody(dp?.body ?? c.excerpt, planning ? 1000 : 800)
          return `• [${c.source}] ${c.title}${body ? `: ${body}` : ''}`
        })
        .join('\n')}`
    )
  }

  if (!parts.length) {
    return `No synced context yet.\nUser question: ${q}\nIf you cannot answer from context, say what to connect in Apps — do not invent numbers or emails.`
  }

  return `${parts.join('\n\n')}\n\nUser question: ${q}`
}

function kbFallbackAssist(query: string, latent: ReturnType<typeof retrieveAssistContext>): AssistResult {
  const top = latent.chunks[0]
  const sources = [...new Set(latent.chunks.slice(0, 5).map((c) => c.source))]
  if (!top) {
    return {
      query,
      intent: 'general',
      headline: 'No context yet',
      response:
        'Start a meeting (⌘⇧L), connect Gmail/Docs in Integrations, or ask after feed items sync into the knowledge base.',
      sayThis:
        '"Let me confirm that in our docs and follow up right after this call with something precise."',
      sources: [],
      trustNote: 'KB is empty for this query — capture the call or sync integrations first.'
    }
  }
  const dp = getDatapoint(top.datapointId)
  const fullBody = dp?.body ?? top.excerpt
  return {
    query,
    intent: 'search',
    headline: cleanKbExcerpt(top.title, 100) || cleanAssistField(top.title, 100),
    response: formatChatAssistBody(fullBody),
    sayThis: (() => {
      const first = formatChatAssistBody(fullBody.split(/[.!?]/)[0] ?? fullBody, 120)
      return first ? `"${first}."` : ''
    })(),
    sources,
    trustNote: 'Retrieved from your knowledge graph (no LLM connected).'
  }
}

async function assistReal(
  query: string,
  objective?: 'discovery' | 'v1_ship',
  options?: { chat?: boolean; history?: ChatTurn[] }
): Promise<AssistResult> {
  const q = query.trim()
  const chat = options?.chat === true
  const history = options?.history
  const latent = retrieveAssistContext(q)
  const session = getActiveMeeting()

  if (chat && isAttentionQuery(q) && !llmAvailable()) {
    const digest = buildAttentionDigest(getRecentItems(40))
    if (digest) {
      return {
        query: q,
        intent: 'general',
        headline: '',
        response: digest,
        sayThis: '',
        sources: []
      }
    }
  }

  const chatSystem = `You are Notch, a concise work assistant. Answer the user's question using ONLY the context below and the conversation history.

Rules:
- Write like a helpful chat assistant — clear prose and bullet lists where useful.
- Do NOT use templates (no HEADLINE, SUMMARY, SAY THIS, or Q: lines).
- Do NOT repeat the user's question back.
- Do NOT copy-paste the daily inbox digest unless they explicitly ask what needs attention today.
- Answer the specific question asked (e.g. financial comparisons, prep, summaries).
- For priority/today questions only, group under: **Tasks**, **Reminders**, **Reviews & FYI**
- If context lacks the data to answer, say so plainly and suggest connecting Apps or pasting the data — never invent emails, events, or numbers.
${isPlanningQuery(q) ? `
Planning mode (tomorrow / agenda / priorities):
- Produce a ranked **Tomorrow agenda** with time blocks where calendar data exists.
- Separate **Must do**, **Should do**, and **If time** sections.
- Pull priorities from KB, open tasks (Monday/Gmail), reminders, and recent meetings.
- End with **Agent handoffs** — 1–3 concrete @cursor or @monday compose commands the user can paste to spin up work (e.g. "@cursor ask: …", "@monday create: …"). Only suggest agents when there is a clear automatable task.` : ''}`

  const isAttention = /attention|priorit|today|what needs|open loops/i.test(q)
  const systemPrompt = chat
    ? chatSystem
    : `You are a Forward Deployed Engineer copilot. Answer ONLY from the provided context.

Format your reply exactly like this (plain text, no markdown headers):
HEADLINE: one short line
SUMMARY: ${isAttention ? 'brief intro then one bullet per item on its own line starting with * ' : '2-4 sentences answering the question'}
SAY THIS: one sentence the FDE can read aloud to the client (in quotes)

Objective: ${objective === 'v1_ship' ? 'fastest shippable win' : 'discovery'}.`

  const userPrompt = chat
    ? buildChatContextBlock(q, latent, session, history)
    : (() => {
        const transcript = session?.chunks
          .slice(-8)
          .map((c) => c.text)
          .join('\n')
        const contextBlock = [
          session
            ? `Active meeting: ${session.title ?? session.dealHint ?? session.id}\nRecent transcript:\n${transcript ?? '(no chunks yet)'}`
            : '',
          latent.chunks.length > 0
            ? `Knowledge base:\n${latent.chunks
                .slice(0, 6)
                .map((c) => {
                  const dp = getDatapoint(c.datapointId)
                  const body = formatChatAssistBody(dp?.body ?? c.excerpt, 1500)
                  return `- [${c.source}] ${c.title}: ${body}`
                })
                .join('\n')}`
            : ''
        ]
          .filter(Boolean)
          .join('\n\n')
        return contextBlock
          ? `${contextBlock}\n\nQuestion: ${q}`
          : `No meeting or KB context yet.\nQuestion: ${q}\nTell the FDE what to do to get context (start ⌘⇧L, sync integrations).`
      })()

  const parse = chat ? parseChatAssist : parseAssistFromLlm

  try {
    if (isGeminiConnected() || ensureGeminiFromEnv('default')) {
      const item = await queryGemini(userPrompt, systemPrompt)
      const parsed = parse(llmRawAnswer(item), q)
      return {
        query: q,
        intent: chat ? 'general' : /say|respond|answer|wtf/i.test(q) ? 'say_this' : 'general',
        ...parsed,
        sources: chat ? [] : [...new Set(latent.chunks.slice(0, 4).map((c) => c.source))],
        latentContext: chat ? undefined : latent
      }
    }
    if (isClaudeConnected() || ensureClaudeFromEnv('default')) {
      const item = await queryClaude(userPrompt, systemPrompt)
      const parsed = parse(llmRawAnswer(item), q)
      return {
        query: q,
        intent: chat ? 'general' : /say|respond|answer|wtf/i.test(q) ? 'say_this' : 'general',
        ...parsed,
        sources: chat ? [] : [...new Set(latent.chunks.slice(0, 4).map((c) => c.source))],
        latentContext: chat ? undefined : latent
      }
    }
  } catch (err) {
    console.warn('[mobile] LLM assist failed:', (err as Error).message)
  }

  if (chat) {
    return chatFallbackResponse(q)
  }

  const fallback = kbFallbackAssist(q, latent)
  return { ...fallback, latentContext: chat ? undefined : latent, sayThis: chat ? '' : fallback.sayThis, sources: chat ? [] : fallback.sources }
}

export async function mobileAssist(
  query: string,
  objective?: 'discovery' | 'v1_ship',
  options?: { chat?: boolean; history?: ChatTurn[] }
): Promise<AssistResult> {
  const chat = options?.chat === true
  if (!prototypeRealEnabled()) {
    if (chat) {
      if (isAttentionQuery(query) && !llmAvailable()) {
        const digest = buildAttentionDigest(getRecentItems(40))
        if (digest) {
          return {
            query: query.trim(),
            intent: 'general',
            headline: '',
            response: digest,
            sayThis: '',
            sources: []
          }
        }
      }
      if (!llmAvailable()) {
        return chatFallbackResponse(query.trim())
      }
      const llmResult = await assistReal(query, objective, { chat: true, history: options?.history })
      return {
        query: llmResult.query,
        intent: llmResult.intent,
        headline: '',
        response: formatChatAssistBody(llmResult.response),
        sayThis: '',
        sources: []
      }
    }
    const result = assistCluster(query, { objective })
    return {
      ...result,
      guideQuestions: result.guideQuestions ?? defaultGuideQuestions(objective)
    }
  }
  const result = await assistReal(query, objective, { chat, history: options?.history })
  if (chat) {
    return {
      query: result.query,
      intent: result.intent,
      headline: '',
      response: formatChatAssistBody(result.response),
      sayThis: '',
      sources: []
    }
  }
  return {
    ...result,
    guideQuestions: result.guideQuestions ?? defaultGuideQuestions(objective)
  }
}

function defaultGuideQuestions(objective?: 'discovery' | 'v1_ship') {
  if (objective === 'v1_ship') {
    return [
      {
        text: 'What is the minimum config you need live in Frankfurt in week one?',
        why: 'Anchors V1 scope before timeline talk',
        urgent: true
      },
      {
        text: 'Who signs off on webhook retry policy on your side — Jen or your SRE lead?',
        why: 'Surfaces decision owner',
        urgent: false
      },
      {
        text: 'If we send the SCC template today, can legal review in parallel with a 2-week pilot?',
        why: 'Keeps momentum on dual track',
        urgent: false
      }
    ]
  }
  return [
    {
      text: 'What does a successful 30-day pilot look like for your team?',
      why: 'Load-bearing — gates timeline conversation',
      urgent: true
    },
    {
      text: 'Is Frankfurt-only acceptable for phase one, with expansion later?',
      why: 'Scopes residency without overcommitting',
      urgent: false
    },
    {
      text: 'Who besides Jen needs to bless the DPA/SCC path?',
      why: 'Maps IT + legal sign-off',
      urgent: false
    }
  ]
}
