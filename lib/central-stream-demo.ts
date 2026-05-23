import type { CentralStreamEvent } from '@shared/cluster'

export const STREAM_SEED: CentralStreamEvent[] = [
  {
    id: 'e1',
    ts: Date.now() - 3600000,
    source: 'gmail',
    kind: 'integration',
    title: 'Sarah Kim confirmed budget ceiling',
    body: 'Re: Acme pilot scope — "$180k ACV is approved pending legal and IT sign-off."',
    meta: { deal: 'Acme Corp' }
  },
  {
    id: 'e2',
    ts: Date.now() - 1800000,
    source: 'slack',
    kind: 'integration',
    title: '#acme-deal — legal loop',
    body: "Sarah: Jen from IT is joining today's call. EU residency will come up.",
    meta: { channel: '#acme-deal' }
  },
  {
    id: 'e3',
    ts: Date.now() - 600000,
    source: 'meet',
    kind: 'transcript_live',
    title: 'Google Meet started',
    body: 'Acme Corp — Technical Deep Dive · 3 attendees · Notch ambient capture active',
    meta: { link: 'meet.google.com/acme-tech' }
  }
]

export const STREAM_REPLAY: Omit<CentralStreamEvent, 'id' | 'ts'>[] = [
  {
    source: 'notch',
    kind: 'transcript_live',
    title: 'Live · Jen Lee',
    body: 'We need to understand your GDPR Article 46 posture — Frankfurt region isolation for all our data.',
    highlight: 'Technical question detected'
  },
  {
    source: 'notch',
    kind: 'assist',
    title: 'Mobile assist used',
    body: 'AE invoked droplet — guidance generated for GDPR / SCC response. Faster than Meet captions.',
    highlight: '⌘⇧Space'
  },
  {
    source: 'notch',
    kind: 'signal',
    title: 'Signal extracted',
    body: 'blocker · EU data residency · confidence 0.91',
    meta: { type: 'blocker' }
  },
  {
    source: 'notch',
    kind: 'transcript_live',
    title: 'Live · Sarah Kim',
    body: 'Budget is approved at $180k ceiling — we just need legal and IT sign-off.',
    highlight: 'Budget confirmed'
  },
  {
    source: 'meet',
    kind: 'transcript_done',
    title: 'Meeting ended · 38 min',
    body: "Google Meet closed. Notch transcript merged to graph — 4m ahead of Meet's own export.",
    highlight: 'Notch beat native transcriber'
  },
  {
    source: 'gong',
    kind: 'integration',
    title: 'Gong recording linked',
    body: 'Call matched to Acme opportunity. Signals synced — no manual upload needed.',
    meta: { deal: 'Acme Corp' }
  },
  {
    source: 'insight',
    kind: 'insight',
    title: 'Ask a better question',
    body: 'Pilot success criteria still open. Before Mark pushes timeline, close: "What does a successful 30-day pilot look like?"',
    highlight: 'Goal A · meeting guidance'
  },
  {
    source: 'salesforce',
    kind: 'action',
    title: 'Opportunity updated',
    body: 'Stage → Technical Eval. EU residency blocker logged. Next step: SCC template sent.',
    meta: { status: 'applied' }
  },
  {
    source: 'build',
    kind: 'build_prompt',
    title: 'Workflow build prompt ready',
    body: 'Pilot scope + EU infra constraints crossed threshold. Agent handoff queued.',
    promptPreview:
      'Build a 30-day pilot workflow for Acme Corp: EU-only data plane (Frankfurt), SCC/DPA package, IT sign-off checklist for Jen Lee, success metrics tied to support automation ROI.',
    highlight: 'Goal B · client → build prompt'
  }
]

export function getStreamBootstrap(): CentralStreamEvent[] {
  return [...STREAM_SEED]
}
