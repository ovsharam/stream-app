import type { MobileContext } from '../../shared/mobile'
import type { ContextChip } from '../../shared/mobile'
import { assistCluster } from '../cluster/service'
import { getGraphSignals, getSimIntel, getSimSignals, getSimTranscript, isSimCallActive } from '../sim/engine'

export function buildMobileContext(objective: 'discovery' | 'v1_ship' = 'v1_ship'): MobileContext {
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

export function mobileAssist(query: string, objective?: 'discovery' | 'v1_ship') {
  const result = assistCluster(query, { objective })
  const guideQuestions = result.guideQuestions ?? defaultGuideQuestions(objective)
  return { ...result, guideQuestions }
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
