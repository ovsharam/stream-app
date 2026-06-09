export type AgentActionSettings = {
  /** Default delay for “Remind later” on agent inbox items. */
  remindLaterMs: number
}

export const DEFAULT_AGENT_REMIND_LATER_MS = 24 * 60 * 60 * 1000

export const AGENT_REMIND_LATER_OPTIONS: { label: string; ms: number }[] = [
  { label: '1 hour', ms: 60 * 60 * 1000 },
  { label: '4 hours', ms: 4 * 60 * 60 * 1000 },
  { label: '24 hours', ms: DEFAULT_AGENT_REMIND_LATER_MS },
  { label: '3 days', ms: 3 * 24 * 60 * 60 * 1000 },
  { label: '1 week', ms: 7 * 24 * 60 * 60 * 1000 }
]

const STORAGE_KEY = 'stream.agentActionSettings'

export function loadAgentActionSettings(): AgentActionSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { remindLaterMs: DEFAULT_AGENT_REMIND_LATER_MS }
    const parsed = JSON.parse(raw) as Partial<AgentActionSettings>
    const ms = Number(parsed.remindLaterMs)
    return {
      remindLaterMs: Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_AGENT_REMIND_LATER_MS
    }
  } catch {
    return { remindLaterMs: DEFAULT_AGENT_REMIND_LATER_MS }
  }
}

export function saveAgentActionSettings(patch: Partial<AgentActionSettings>): AgentActionSettings {
  const next = { ...loadAgentActionSettings(), ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  window.dispatchEvent(new Event('notch:agent-action-settings'))
  return next
}

export function formatRemindLaterLabel(ms: number): string {
  const match = AGENT_REMIND_LATER_OPTIONS.find((o) => o.ms === ms)
  if (match) return match.label
  if (ms < 60 * 60 * 1000) return `${Math.round(ms / 60_000)} min`
  if (ms < 24 * 60 * 60 * 1000) return `${Math.round(ms / (60 * 60 * 1000))} hours`
  return `${Math.round(ms / (24 * 60 * 60 * 1000))} days`
}
