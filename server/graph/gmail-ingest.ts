import type { Signal, SignalType } from '../../shared/graph'
import { ingestSignal } from './store'
import type { StreamItem } from '../../shared/types'

const SIGNAL_PATTERNS: { re: RegExp; type: SignalType; token: string }[] = [
  { re: /eu data residency|gdpr|data residency|article 46|scc|dpa/i, type: 'compliance', token: 'EU data residency' },
  { re: /legal (gate|review|approval)/i, type: 'blocker', token: 'legal gate' },
  { re: /\$[\d,]+k?|\bbudget\b|fy\d{2}/i, type: 'budget', token: 'budget signal' },
  { re: /mcp|agent build|custom integration|api migration/i, type: 'technical', token: 'MCP agent build' },
  { re: /pilot|quick win|30 day|2 week/i, type: 'motion', token: 'pilot motion' },
  { re: /timeline|deadline|by monday|eod|asap/i, type: 'timeline', token: 'timeline pressure' }
]

export function extractSignalsFromEmail(
  caseId: string,
  item: StreamItem
): Signal[] {
  const text = `${item.title ?? ''} ${item.bodyFull ?? item.body}`
  const ingested: Signal[] = []

  for (const p of SIGNAL_PATTERNS) {
    if (!p.re.test(text)) continue
    const match = text.match(p.re)
    const excerpt = text.slice(0, 200).trim()

    ingested.push(
      ingestSignal({
        caseId,
        type: p.type,
        token: p.token,
        excerpt: match ? `${excerpt}…` : excerpt,
        source: 'gmail',
        sourceRef: item.id,
        confidence: 0.82,
        metadata: { subject: item.title, from: item.sender.name }
      })
    )
  }

  return ingested
}

export function syncGmailItemsToGraph(caseId: string, items: StreamItem[]): Signal[] {
  const gmailItems = items.filter((i) => i.source === 'gmail')
  return gmailItems.flatMap((item) => extractSignalsFromEmail(caseId, item))
}
