import { randomUUID } from 'crypto'
import type {
  Case,
  CrossCasePattern,
  GraphEdge,
  GraphSearchResult,
  Signal,
  Entity,
  ActiveContext,
  SearchScope
} from '../../shared/graph'
import { browserScopeChips } from '../browser/context'

type Store = {
  cases: Map<string, Case>
  signals: Map<string, Signal>
  entities: Map<string, Entity>
  edges: Map<string, GraphEdge>
  patterns: Map<string, CrossCasePattern>
  activeCaseId: string | null
}

const store: Store = {
  cases: new Map(),
  signals: new Map(),
  entities: new Map(),
  edges: new Map(),
  patterns: new Map(),
  activeCaseId: null
}

let seeded = false

export function initGraphDemo(): void {
  if (seeded) return
  seeded = true

  const acme: Case = {
    id: 'case-acme',
    name: 'Acme Corp — Agent Platform',
    company: 'Acme Corp',
    stage: 'discovery',
    betSize: 'big_bet',
    healthScore: 62,
    ownerId: 'ae-1',
    amount: 240_000,
    closeDate: '2026-08-15',
    updatedAt: new Date(),
    metadata: {}
  }

  const pineapple: Case = {
    id: 'case-pineapple',
    name: 'Pineapple AI — Pilot',
    company: 'Pineapple AI',
    stage: 'technical_eval',
    betSize: 'quick_win',
    healthScore: 41,
    ownerId: 'ae-1',
    amount: 48_000,
    updatedAt: new Date(),
    metadata: { stalledDays: 21 }
  }

  const fintech: Case = {
    id: 'case-fintech',
    name: 'NovaBank — Compliance Stack',
    company: 'NovaBank',
    stage: 'closed_won',
    betSize: 'big_bet',
    healthScore: 95,
    ownerId: 'ae-1',
    amount: 180_000,
    updatedAt: new Date(Date.now() - 90 * 86400000),
    metadata: {}
  }

  store.cases.set(acme.id, acme)
  store.cases.set(pineapple.id, pineapple)
  store.cases.set(fintech.id, fintech)
  store.activeCaseId = acme.id

  const signals: Signal[] = [
    {
      id: 'sig-1',
      caseId: acme.id,
      type: 'compliance',
      token: 'EU data residency',
      excerpt: 'Legal asked about EU data residency before we can proceed with agent deployment.',
      source: 'gong',
      confidence: 0.94,
      extractedAt: new Date(Date.now() - 2 * 86400000),
      patternId: 'pat-eu-residency',
      metadata: {}
    },
    {
      id: 'sig-2',
      caseId: acme.id,
      type: 'blocker',
      token: 'legal gate',
      excerpt: 'Sarah Chen: "We cannot sign until legal reviews subprocessors list."',
      source: 'slack',
      confidence: 0.91,
      extractedAt: new Date(Date.now() - 86400000),
      patternId: 'pat-eu-residency',
      metadata: {}
    },
    {
      id: 'sig-3',
      caseId: acme.id,
      type: 'champion',
      token: 'Sarah Kim',
      excerpt: 'Sarah Kim driving internal eval — mentioned "quick win on support automation".',
      source: 'gong',
      confidence: 0.88,
      extractedAt: new Date(Date.now() - 3 * 86400000),
      metadata: {}
    },
    {
      id: 'sig-4',
      caseId: acme.id,
      type: 'budget',
      token: '$240K FY26',
      excerpt: 'Budget confirmed in discovery — pending legal, not procurement.',
      source: 'salesforce',
      confidence: 0.85,
      extractedAt: new Date(Date.now() - 5 * 86400000),
      metadata: {}
    },
    {
      id: 'sig-5',
      caseId: pineapple.id,
      type: 'compliance',
      token: 'EU data residency',
      excerpt: 'Same residency concern — no DPA sent yet. Stalled 3 weeks.',
      source: 'gmail',
      confidence: 0.92,
      extractedAt: new Date(Date.now() - 21 * 86400000),
      patternId: 'pat-eu-residency',
      metadata: {}
    },
    {
      id: 'sig-6',
      caseId: fintech.id,
      type: 'compliance',
      token: 'EU data residency',
      excerpt: 'Resolved with SCC + DPA package sent within 48h of blocker raised.',
      source: 'gong',
      confidence: 0.96,
      extractedAt: new Date(Date.now() - 120 * 86400000),
      patternId: 'pat-eu-residency',
      metadata: { resolved: true }
    },
    {
      id: 'sig-7',
      caseId: acme.id,
      type: 'technical',
      token: 'MCP agent build',
      excerpt: 'Customer wants custom MCP for Salesforce + internal wiki — FDE scoping needed.',
      source: 'gong',
      confidence: 0.89,
      extractedAt: new Date(Date.now() - 86400000),
      metadata: {}
    }
  ]

  for (const s of signals) store.signals.set(s.id, s)

  store.patterns.set('pat-eu-residency', {
    id: 'pat-eu-residency',
    token: 'EU data residency',
    signalType: 'compliance',
    caseCount: 3,
    caseIds: [acme.id, pineapple.id, fintech.id],
    resolution:
      'Closed-won NovaBank sent DPA + SCC within 48h. Pineapple stalled — no doc sent yet.',
    resolvedInCaseIds: [fintech.id]
  })
}

export function getActiveContext(): ActiveContext {
  initGraphDemo()
  const activeCase = store.activeCaseId
    ? (store.cases.get(store.activeCaseId) ?? null)
    : null

  const caseSignals = activeCase
    ? [...store.signals.values()].filter((s) => s.caseId === activeCase.id)
    : []

  const chips = [
    ...caseSignals
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 6)
      .map((s) => s.token),
    ...browserScopeChips()
  ].filter((c, i, a) => a.indexOf(c) === i)

  const scope: SearchScope = {
    caseId: activeCase?.id,
    caseName: activeCase?.name,
    chips,
    entityIds: [],
    signalIds: caseSignals.map((s) => s.id)
  }

  const patterns = [...store.patterns.values()].filter((p) =>
    activeCase ? p.caseIds.includes(activeCase.id) : true
  )

  return {
    activeCase,
    scope,
    recentSignals: caseSignals.sort(
      (a, b) => b.extractedAt.getTime() - a.extractedAt.getTime()
    ),
    patterns,
    prepPoints: activeCase
      ? [
          'Confirm legal timeline for EU data residency — offer NovaBank playbook (DPA + SCC in 48h)',
          'Validate quick-win: support automation MCP before full agent platform scope',
          'Ask: who signs subprocessors list besides Sarah Kim?',
          'Big-bet signal: custom MCP + SF integration — propose 2-week pilot scope'
        ]
      : []
  }
}

export function searchGraph(query: string, limit = 12): GraphSearchResult[] {
  initGraphDemo()
  const q = query.toLowerCase().trim()
  const ctx = getActiveContext()
  const results: GraphSearchResult[] = []

  if (!q) {
    for (const c of store.cases.values()) {
      if (c.stage !== 'closed_won' && c.stage !== 'closed_lost') {
        results.push({
          kind: 'case',
          id: c.id,
          title: c.name,
          subtitle: `${c.stage} · health ${c.healthScore}`,
          caseId: c.id,
          score: c.id === ctx.activeCase?.id ? 1 : 0.7
        })
      }
    }
    for (const p of ctx.patterns) {
      results.push({
        kind: 'pattern',
        id: p.id,
        title: p.token,
        subtitle: `Across ${p.caseCount} deals`,
        score: 0.85
      })
    }
    return results.sort((a, b) => b.score - a.score).slice(0, limit)
  }

  for (const s of store.signals.values()) {
    const hay = `${s.token} ${s.excerpt}`.toLowerCase()
    if (!hay.includes(q)) continue
    const c = store.cases.get(s.caseId)
    const inScope = ctx.scope.caseId === s.caseId ? 0.3 : 0
    results.push({
      kind: 'signal',
      id: s.id,
      title: s.token,
      subtitle: `${c?.company ?? 'Case'} · ${s.source}`,
      caseId: s.caseId,
      source: s.source,
      signalType: s.type,
      score: s.confidence + inScope
    })
  }

  for (const c of store.cases.values()) {
    if (`${c.name} ${c.company}`.toLowerCase().includes(q)) {
      results.push({
        kind: 'case',
        id: c.id,
        title: c.name,
        subtitle: c.company,
        caseId: c.id,
        score: 0.75
      })
    }
  }

  for (const p of store.patterns.values()) {
    if (p.token.toLowerCase().includes(q)) {
      results.push({
        kind: 'pattern',
        id: p.id,
        title: p.token,
        subtitle: p.resolution ?? `${p.caseCount} cases`,
        score: 0.8
      })
    }
  }

  if ('se brief'.includes(q) || q.includes('brief') || q.includes('gdpr')) {
    results.push({
      kind: 'action',
      id: 'action-se-brief',
      title: 'SE Brief — GDPR / Article 46',
      subtitle: 'Plain-English technical answer for live call (⌘K)',
      score: 0.95
    })
  }

  if (q.includes('score') || q.includes('quick') || q.includes('big bet')) {
    const c = ctx.activeCase
    if (c) {
      results.unshift({
        kind: 'action',
        id: 'action-fde-score',
        title: `FDE score · ${c.company}`,
        subtitle: `${c.betSize === 'unknown' ? 'Run scorer' : c.betSize} · press Enter`,
        caseId: c.id,
        score: 0.98
      })
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit)
}

export function getCase(id: string): Case | undefined {
  initGraphDemo()
  return store.cases.get(id)
}

export function listCases(): Case[] {
  initGraphDemo()
  return [...store.cases.values()].sort(
    (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()
  )
}

export function getPattern(id: string): CrossCasePattern | undefined {
  initGraphDemo()
  return store.patterns.get(id)
}

export function ingestSignal(
  partial: Omit<Signal, 'id' | 'extractedAt'> & { id?: string }
): Signal {
  initGraphDemo()
  const signal: Signal = {
    ...partial,
    id: partial.id ?? randomUUID(),
    extractedAt: new Date()
  }
  store.signals.set(signal.id, signal)
  const c = store.cases.get(signal.caseId)
  if (c) {
    c.updatedAt = new Date()
    store.cases.set(c.id, c)
  }
  return signal
}

export function getSignalsForCase(caseId: string): Signal[] {
  initGraphDemo()
  return [...store.signals.values()].filter((s) => s.caseId === caseId)
}

export function setActiveCase(id: string): Case | null {
  initGraphDemo()
  if (!store.cases.has(id)) return null
  store.activeCaseId = id
  return store.cases.get(id) ?? null
}
