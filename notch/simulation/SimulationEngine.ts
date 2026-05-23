import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import type {
  CallFixture,
  CallReplayCallbacks,
  DealFixture,
  ExtractedSignal,
  LoadBearingGap,
  PostCallSummary,
  PreCallPrep,
  ScenarioFixture,
  TechnicalQuestion
} from './types'

function fixtureRoot(): string {
  const candidates = [
    join(__dirname, 'fixtures'),
    join(process.cwd(), 'notch/simulation/fixtures'),
    join(__dirname, '..', 'simulation', 'fixtures')
  ]
  for (const p of candidates) {
    if (existsSync(join(p, 'deals'))) return p
  }
  return join(__dirname, 'fixtures')
}

function loadJson<T>(...parts: string[]): T {
  const path = join(fixtureRoot(), ...parts)
  return JSON.parse(readFileSync(path, 'utf-8')) as T
}

export type SimulationMode = 'simulation' | 'live'

export class SimulationEngine {
  private scenario: ScenarioFixture
  private mode: SimulationMode = 'simulation'
  private replayTimer: ReturnType<typeof setTimeout> | null = null
  private sessionSignals: ExtractedSignal[] = []
  private transcriptLog: { speaker: string; text: string }[] = []

  constructor(scenarioId = 'live-call-demo') {
    this.scenario = loadJson<ScenarioFixture>('scenarios', `${scenarioId}.json`)
  }

  setMode(mode: SimulationMode): void {
    this.mode = mode
  }

  getMode(): SimulationMode {
    return this.mode
  }

  getScenario(): ScenarioFixture {
    return this.scenario
  }

  async getDealContext(dealId: string): Promise<DealFixture> {
    return loadJson<DealFixture>('deals', `${dealId}.json`)
  }

  async getPreCallPrep(dealId: string): Promise<PreCallPrep> {
    const deal = await this.getDealContext(dealId)
    const recentSignal = deal.signals[0]
    const patterns = await this.getCrossCasePatterns('blocker')
    return {
      deal,
      calendar: this.scenario.calendar_event,
      talking_points: deal.talking_points,
      context_note: recentSignal
        ? `Latest signal (${recentSignal.source}): ${recentSignal.content}`
        : 'No recent signals on this account.',
      watch_out: deal.contacts.find((c) => c.role === 'economic_buyer')?.notes ?? '',
      attendees: deal.contacts,
      last_meeting_summary: deal.last_meeting.summary,
      agreed_next_steps: deal.last_meeting.agreed_next_steps,
      cross_case_patterns: patterns
    }
  }

  async getCrossCasePatterns(signalType: string): Promise<{ dealId: string; company: string; content: string }[]> {
    const deals = ['acme-corp', 'pineapple-inc', 'redwood-hq']
    const matches: { dealId: string; company: string; content: string }[] = []
    for (const id of deals) {
      const deal = await this.getDealContext(id)
      for (const s of deal.signals) {
        if (s.type === signalType || s.content.toLowerCase().includes('residency')) {
          matches.push({ dealId: id, company: deal.company, content: s.content })
        }
      }
    }
    return matches
  }

  startCallReplay(callId: string, callbacks: CallReplayCallbacks, speed = 1): void {
    this.stopCallReplay()
    this.sessionSignals = []
    this.transcriptLog = []

    const call = loadJson<CallFixture>('calls', `${callId}.json`)

    for (const event of call.events) {
      const delay = (event.t * 1000) / speed
      setTimeout(() => {
        if ('signal_type' in event) {
          if (event.signal_type === 'technical_question' && event.generated_response) {
            callbacks.onTechnicalQuestion({
              question: event.signal_content,
              response: event.generated_response,
              sources: event.sources ?? []
            })
          }
          if (event.signal_type === 'load_bearing_question_gap') {
            callbacks.onLoadBearingGap({
              content: event.signal_content,
              urgency: event.urgency ?? 'high'
            })
          }
          if (event.signal_type === 'signal') {
            const sig: ExtractedSignal = {
              type: event.signal_type_extracted ?? 'motion',
              content: event.signal_content,
              confidence: event.confidence ?? 0.9
            }
            this.sessionSignals.push(sig)
            callbacks.onSignalDetected(sig)
          }
          return
        }

        const chunk = event
        this.transcriptLog.push({ speaker: chunk.speaker, text: chunk.text })
        callbacks.onTranscriptChunk(chunk.speaker, chunk.text)
      }, delay)
    }

    const maxT = call.events.reduce((m, e) => Math.max(m, e.t), 0)
    const endDelay = ((maxT + 15) * 1000) / speed
    this.replayTimer = setTimeout(() => {
      void this.getPostCallSummary(call.id).then(callbacks.onCallEnd)
    }, endDelay)
  }

  stopCallReplay(): void {
    if (this.replayTimer) {
      clearTimeout(this.replayTimer)
      this.replayTimer = null
    }
  }

  async getPostCallSummary(_sessionId: string): Promise<PostCallSummary> {
    const deal = await this.getDealContext(this.scenario.active_deal_id)
    const lines = this.transcriptLog.slice(-6).map((l) => `${l.speaker}: ${l.text}`)
    return {
      summary: [
        'Technical deep-dive with Acme IT and finance.',
        'Jen raised GDPR Art. 46 / Frankfurt isolation — addressed with SCC + EU pilot scope.',
        'Mark asked timeline; pilot success criteria still need explicit agreement.',
        'Sarah confirmed $180k budget ceiling pending legal/IT sign-off.'
      ].join(' '),
      signals: this.sessionSignals.length
        ? this.sessionSignals
        : deal.signals.slice(0, 3).map((s) => ({
            type: s.type,
            content: s.content,
            confidence: s.confidence
          })),
      actions: [
        { type: 'email', label: 'Draft follow-up with SCC template attached', status: 'ready' },
        { type: 'salesforce', label: 'Update stage → Technical Eval, log EU residency blocker', status: 'applied' },
        { type: 'graph', label: 'Graph updated with 3 new signals', status: 'applied' },
        { type: 'build', label: 'Build brief queued — pilot scope threshold met', status: 'queued' }
      ]
    }
  }
}
