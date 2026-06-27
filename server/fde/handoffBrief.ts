import type { AgentProposal } from '../../shared/agent-proposal'
import type { FdeEngagement } from '../../shared/fde-engagement'
import type { HandoffBrief } from '../../shared/handoff'
import { retrieveContext } from '../kb/pipeline'
import { getProposal } from '../agent/store'

export type { HandoffBrief }

function scopeMotion(scope: FdeEngagement['scope']): string {
  if (scope === 'quick_win') {
    return 'Bounded pilot — ship a thin slice in <45 days without custom platform work.'
  }
  if (scope === 'big_bet') {
    return 'Enterprise scope — expect security review, integrations, and custom build path.'
  }
  return 'Run one more discovery pass — scope is still ambiguous for this ICP.'
}

export function buildHandoffBrief(engagement: FdeEngagement): HandoffBrief {
  const proposals = (engagement.proposalIds ?? [])
    .map((id) => getProposal(id))
    .filter((p): p is AgentProposal => p != null)

  const buyerLines: string[] = []
  for (const p of proposals) {
    buyerLines.push(`${p.senderName} (${p.intent}): ${p.rawMessage.slice(0, 280)}`)
  }
  if (engagement.summary && !buyerLines.length) {
    buyerLines.push(engagement.summary)
  }

  const query = [engagement.clientName, engagement.company, ...buyerLines].filter(Boolean).join(' ')
  const kb = retrieveContext(query.slice(0, 400), 5)
  const kbExcerpts = kb.chunks.map((c) => c.excerpt).filter(Boolean).slice(0, 4)

  const gapSummary =
    engagement.summary ??
    proposals[0]?.brief?.humanSummary ??
    `${engagement.clientName} is in evaluation — technical buyer signals need FDE translation before AE can close.`

  const aeActions: string[] = []
  const fdeActions: string[] = []

  if (engagement.stage === 'intake' || engagement.stage === 'context') {
    aeActions.push('Confirm champion, budget band, and decision timeline with the buyer.')
    aeActions.push('Socialize the scope bucket (quick win vs big bet) with leadership.')
    fdeActions.push('Validate technical fit — integrations, data residency, eval environment.')
    fdeActions.push('Propose a concrete next session or POC scope in writing.')
  } else if (engagement.stage === 'build' || engagement.stage === 'test') {
    aeActions.push('Keep commercial thread warm — contract path and procurement contacts.')
    fdeActions.push('Execute build brief and publish weekly proof points to the buyer.')
  } else {
    aeActions.push('Monitor expansion signals and executive sponsorship.')
    fdeActions.push('Maintain runbook, SLAs, and agent-to-agent hooks for support.')
  }

  for (const step of engagement.nextSteps.slice(0, 3)) {
    fdeActions.push(step)
  }

  if (engagement.flags.length > 0) {
    fdeActions.unshift(`Flags: ${engagement.flags.slice(0, 2).join(' · ')}`)
  }

  return {
    engagementId: engagement.id,
    clientName: engagement.clientName,
    stage: engagement.stage,
    scope: engagement.scope,
    gapSummary,
    buyerContext: buyerLines.join('\n\n') || 'No inbound signal text yet — check Feed or take a discovery call.',
    fdeMotion: scopeMotion(engagement.scope),
    aeActions: [...new Set(aeActions)].slice(0, 5),
    fdeActions: [...new Set(fdeActions)].slice(0, 6),
    kbExcerpts,
    linkedProposals: proposals.map((p) => ({
      id: p.id,
      intent: p.intent,
      senderName: p.senderName,
      summary: p.brief?.humanSummary ?? p.rawMessage.slice(0, 120)
    })),
    generatedAt: Date.now()
  }
}
