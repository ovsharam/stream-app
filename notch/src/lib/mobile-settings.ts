export type MobileObjective = 'discovery' | 'v1_ship'

export type MobileClusterSettings = {
  ambientListen: boolean
  objective: MobileObjective
  autoTranscribe: boolean
  hotkeyLabel: string
}

const STORAGE_KEY = 'notch-mobile-settings'

export const DEFAULT_MOBILE_SETTINGS: MobileClusterSettings = {
  ambientListen: true,
  objective: 'v1_ship',
  autoTranscribe: true,
  hotkeyLabel: '⌘⇧M'
}

export function loadMobileSettings(): MobileClusterSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_MOBILE_SETTINGS }
    return { ...DEFAULT_MOBILE_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return { ...DEFAULT_MOBILE_SETTINGS }
  }
}

export function saveMobileSettings(s: MobileClusterSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
}

export type AmbientContext = {
  meetingTitle: string
  company: string
  elapsed: string
  originalGoal: string
  currentGoal: string
  activeTopic: string
  recentLines: { speaker: string; text: string }[]
  objectiveShift: string
}

export function buildAmbientContext(objective: MobileObjective): AmbientContext {
  const v1 = objective === 'v1_ship'
  return {
    meetingTitle: 'Acme Corp — Technical Deep Dive',
    company: 'Acme Corp',
    elapsed: '18m',
    originalGoal: 'Discovery — map requirements & compliance posture',
    currentGoal: v1
      ? 'Ship V1 ASAP — minimal config to get them live in Frankfurt'
      : 'Discovery — understand platform config & integration needs',
    activeTopic:
      'Webhook retry policy + Frankfurt region isolation for their event pipeline',
    recentLines: [
      { speaker: 'Jen Lee', text: 'How does your webhook retry behave when our endpoint is down for maintenance?' },
      { speaker: 'Sarah Kim', text: 'We need Frankfurt isolation — nothing can leave EU, even retry queues.' },
      { speaker: 'Jen Lee', text: 'What\'s the default config for dead-letter handling in your stack?' }
    ],
    objectiveShift: v1
      ? 'Call shifted from discovery → V1 scoping. Notch is re-ranking talk tracks for speed-to-pilot.'
      : 'Still in discovery mode — gathering config & compliance requirements.'
  }
}
