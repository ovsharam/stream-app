import type { CentralStreamEvent } from '../../shared/cluster'
import { getRecentItems } from '../db'
import { getSimIntel, getSimSignals, getSimTranscript, isSimCallActive } from '../sim/engine'

type UserRole = 'ae' | 'am' | 'csm' | 'fde'
type ExternalSource = 'gmail' | 'slack' | 'x' | 'monday' | 'discord' | 'perplexity' | 'note'

function hash(input: string): string {
  let h = 0
  for (let i = 0; i < input.length; i += 1) h = (h << 5) - h + input.charCodeAt(i)
  return Math.abs(h).toString(36)
}

function roleSummary(role: UserRole, transcript: string[], signals: string[]): string {
  const joined = transcript.join(' ')
  const technicalFocus = /webhook|retry|gdpr|scc|residency/i.test(joined)
  const budgetFocus = /\$|budget|acv|approved/i.test(joined)
  const timelineFocus = /timeline|q[1-4]|go live|deadline/i.test(joined)

  if (role === 'ae') {
    return [
      `- Deal momentum: ${budgetFocus ? 'budget is validated' : 'budget signal is not explicit yet — confirm owner and amount'}.`,
      `- Close risk: ${technicalFocus ? 'EU residency + webhook policy still unresolved' : 'primary blocker lacks a named owner'}.`,
      `- Next line to use: "Before timeline, let’s lock pilot success criteria and who signs off technical scope."`
    ].join('\n')
  }

  if (role === 'am') {
    return [
      `- Commercial signal: ${budgetFocus ? 'intent is present and actionable' : 'commercial posture is still exploratory — validate expansion path'}.`,
      `- Delivery dependency: ${technicalFocus ? 'in-region architecture commitments are required' : 'implementation requirements are still soft'}.`,
      `- Next step: align handoff checklist and capture customer sign-off path in writing.`
    ].join('\n')
  }

  if (role === 'csm') {
    return [
      `- Adoption risk: ${technicalFocus ? 'security/compliance confidence must be established early' : 'timeline certainty is currently weak'}`,
      `- Success criteria: ${timelineFocus ? 'customer is pushing dates before definition' : 'needs explicit measurable outcomes'}`,
      `- Next step: capture pilot success metrics and stakeholder owners now`
    ].join('\n')
  }

  return [
    `- Technical scope: ${technicalFocus ? 'Frankfurt residency + webhook retry policy is load-bearing' : 'architecture constraints still need explicit definition'}.`,
    `- Delivery posture: ${timelineFocus ? 'timeline pressure is rising — keep commitments bounded' : 'timeline remains secondary to requirements'}.`,
    `- Next engineering action: prepare a V1 config baseline with risk flags for clean handoff.`
  ].join('\n')
}

function gongRoleEvent(role: UserRole, now: number): CentralStreamEvent | null {
  const transcript = getSimTranscript().slice(-6).map((l) => l.text)
  const signalLines = getSimSignals()
    .slice(-4)
    .map((s) => `${s.type}: ${s.content}`)
  if (transcript.length === 0 && signalLines.length === 0) return null

  return {
    id: `gong-role-${role}-${hash(`${transcript.join('|')}|${signalLines.join('|')}`)}`,
    ts: now - 1200,
    source: 'gong',
    kind: 'insight',
    title: `Gong Agent · ${role.toUpperCase()} call brief`,
    body: roleSummary(role, transcript, signalLines),
    highlight: 'Role-tailored summary'
  }
}

function mapExternalSource(source: ExternalSource): CentralStreamEvent['source'] {
  if (source === 'perplexity' || source === 'note') return 'insight'
  return source
}

function externalEvents(now: number): CentralStreamEvent[] {
  const items = getRecentItems(220).filter((item) =>
    ['gmail', 'slack', 'x', 'monday', 'discord', 'perplexity', 'note'].includes(item.source)
  )

  const mondayItems = items.filter((item) => item.source === 'monday')
  const nonMondayItems = items.filter((item) => item.source !== 'monday').slice(0, 100)

  const mondayThreadMap = new Map<
    string,
    {
      latestTs: number
      latestBody: string
      parentBody: string
      parentTs: number
      count: number
      itemName: string
      itemId: string
      boardName: string
      actions: string[]
      senders: Set<string>
    }
  >()

  for (const item of mondayItems) {
    const ts = item.timestamp.getTime() || now
    const dayKey = new Date(ts).toISOString().slice(0, 10)
    const itemId = String(item.metadata?.itemId ?? item.metadata?.updateId ?? item.id)
    const itemName = String(item.metadata?.itemName ?? item.title ?? 'Task')
    const key = `${itemId}:${dayKey}`
    const action = item.body.replace(/\s+/g, ' ').trim()

    const existing = mondayThreadMap.get(key)
    if (!existing) {
      mondayThreadMap.set(key, {
        latestTs: ts,
        latestBody: item.body,
        parentBody: item.body,
        parentTs: ts,
        count: 1,
        itemName,
        itemId,
        boardName: String(item.metadata?.boardName ?? ''),
        actions: action ? [action] : [],
        senders: new Set([item.sender.name])
      })
      continue
    }

    existing.count += 1
    existing.senders.add(item.sender.name)
    if (action && !existing.actions.includes(action) && existing.actions.length < 3) {
      existing.actions.push(action)
    }
    if (ts < existing.parentTs) {
      existing.parentTs = ts
      existing.parentBody = item.body
    }
    if (ts > existing.latestTs) {
      existing.latestTs = ts
      existing.latestBody = item.body
    }
  }

  const mondayThreadEvents: CentralStreamEvent[] = [...mondayThreadMap.entries()]
    .map(([key, value]) => {
      const summary =
        value.actions.length > 0
          ? `${value.count} updates today.\n${value.actions.map((a) => `• ${a}`).join('\n')}`
          : `${value.count} updates today.\nLatest: ${value.latestBody}`
      return {
        id: `ext-monday-thread-${hash(`${key}:${value.count}:${value.latestTs}`)}`,
        ts: value.latestTs,
        source: 'monday',
        kind: 'integration',
        title: value.itemName,
        body: value.parentBody,
        highlight: `${Math.max(0, value.count - 1)} updates`,
        meta: {
          source: 'monday',
          itemId: value.itemId,
          day: key.split(':')[1],
          boardName: value.boardName,
          threadCount: String(Math.max(0, value.count - 1)),
          threadSummary: summary,
          participants: String(value.senders.size),
          grouped: 'true',
          parentTs: String(value.parentTs)
        }
      }
    })
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 24)

  const nonMondayEvents: CentralStreamEvent[] = nonMondayItems.map((item, idx) => ({
      id: `ext-${item.id}`,
      ts: item.timestamp.getTime() || now - idx * 1000,
      source: mapExternalSource(item.source as ExternalSource),
      kind: 'integration' as const,
      title: item.title || `${item.sender.name} · ${item.source.toUpperCase()}`,
      body: item.body,
      highlight: `${item.source.toUpperCase()} sync`,
      meta: {
        sender: item.sender.name,
        source: item.source,
        itemId: item.id,
        ...(item.metadata?.threadId ? { threadId: String(item.metadata.threadId) } : {}),
        ...(item.metadata?.accountId ? { accountId: String(item.metadata.accountId) } : {}),
        ...(item.metadata?.accountEmail
          ? { accountEmail: String(item.metadata.accountEmail) }
          : {}),
        ...(item.source === 'gmail' && item.metadata?.messageCount
          ? {
              threadCount: String(Math.max(0, Number(item.metadata.messageCount) - 1)),
              grouped: Number(item.metadata.messageCount) > 1 ? 'true' : undefined
            }
          : {})
      }
    }))

  if (mondayThreadEvents.length > 0) {
    return [...mondayThreadEvents, ...nonMondayEvents].sort((a, b) => b.ts - a.ts)
  }

  return nonMondayEvents.sort((a, b) => b.ts - a.ts)
}

export function getCentralStream(role: UserRole = 'ae'): CentralStreamEvent[] {
  const live = isSimCallActive()
  const now = Date.now()
  const external = externalEvents(now)

  const transcriptEvents: CentralStreamEvent[] = getSimTranscript()
    .slice(-14)
    .reverse()
    .map((line, idx) => ({
      id: `tx-${hash(`${line.speaker}:${line.text}`)}`,
      ts: now - idx * 3000,
      source: 'notch',
      kind: 'transcript_live',
      title: 'Transcribing…',
      body: line.text,
      speaker: line.speaker
    }))

  const signalEvents: CentralStreamEvent[] = getSimSignals()
    .slice(-8)
    .reverse()
    .map((sig, idx) => ({
      id: `sig-${hash(`${sig.type}:${sig.content}`)}`,
      ts: now - 45000 - idx * 3000,
      source: 'notch',
      kind: 'signal',
      title: 'Signal extracted',
      body: `${sig.type} · ${sig.content}`,
      meta: { confidence: String(sig.confidence) }
    }))

  const intel = getSimIntel()
  const intelEvents: CentralStreamEvent[] = []

  if (intel.technical) {
    intelEvents.push({
      id: `tech-${hash(intel.technical.question)}`,
      ts: now - 2000,
      source: 'notch',
      kind: 'assist',
      title: 'Technical question detected',
      body: intel.technical.question,
      highlight: 'Live FDE assist'
    })
  }

  if (intel.gap) {
    intelEvents.push({
      id: `gap-${hash(intel.gap.content)}`,
      ts: now - 3500,
      source: 'insight',
      kind: 'insight',
      title: 'Load-bearing gap',
      body: intel.gap.content,
      highlight: `Urgency: ${intel.gap.urgency}`
    })
  }

  const gongEvent = gongRoleEvent(role, now)
  if (gongEvent) intelEvents.push(gongEvent)

  if (!live) {
    const mergedIdle = gongEvent
      ? [gongEvent, ...external]
      : [...external]
    return mergedIdle.sort((a, b) => b.ts - a.ts)
  }

  const merged = [...transcriptEvents, ...signalEvents, ...intelEvents, ...external]
  const unique = new Map<string, CentralStreamEvent>()
  for (const e of merged) if (!unique.has(e.id)) unique.set(e.id, e)
  return [...unique.values()].sort((a, b) => b.ts - a.ts)
}
