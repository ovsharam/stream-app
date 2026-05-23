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
    ts: Date.now() - 120000,
    source: 'meet',
    kind: 'transcript_live',
    title: 'Google Meet started',
    body: 'Acme Corp — Technical Deep Dive · Sarah Kim, Mark O\'Brien, Jen Lee',
    joinable: true,
    meetingLink: 'https://meet.google.com/acme-tech-deep-dive',
    highlight: 'Join from Notch'
  }
]

export const STREAM_REPLAY: Omit<CentralStreamEvent, 'id' | 'ts'>[] = [
  {
    source: 'notch',
    kind: 'transcript_live',
    title: 'Transcribing…',
    speaker: 'Jen Lee',
    body: 'We need to understand your GDPR Article 46 posture — Frankfurt region isolation for all our data.',
    highlight: 'Notch AI · live'
  },
  {
    source: 'notch',
    kind: 'assist',
    title: 'Mobile assist',
    body: 'AE opened droplet — GDPR / SCC guidance ready. Faster than Meet captions.',
    highlight: '⌘⇧Space'
  },
  {
    source: 'notch',
    kind: 'transcript_live',
    speaker: 'Sarah Kim',
    title: 'Transcribing…',
    body: 'Budget is approved at $180k ceiling — we just need legal and IT sign-off.',
    highlight: 'Notch AI · live'
  },
  {
    source: 'notch',
    kind: 'signal',
    title: 'Signal extracted',
    body: 'blocker · EU data residency · confidence 0.91'
  },
  {
    source: 'meet',
    kind: 'transcript_done',
    title: 'Meeting ended · 38 min',
    body: 'Transcript saved to graph. Notch finished 4 minutes before Meet export.',
    highlight: 'Full transcript ready'
  },
  {
    source: 'gong',
    kind: 'integration',
    title: 'Gong recording linked',
    body: 'Auto-matched to Acme opportunity.'
  },
  {
    source: 'insight',
    kind: 'insight',
    title: 'Ask a better question',
    body: 'Close pilot success criteria before Mark pushes timeline.',
    highlight: 'Meeting guidance'
  },
  {
    source: 'build',
    kind: 'build_prompt',
    title: 'Workflow build prompt ready',
    body: 'Pilot + EU infra constraints → agent handoff.',
    promptPreview:
      'Build 30-day pilot workflow: Frankfurt isolation, SCC/DPA, IT sign-off checklist, support automation ROI metrics.',
    highlight: '→ build agents'
  }
]
