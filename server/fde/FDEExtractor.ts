import type { ExtractedSignal, LoadBearingGap, TechnicalQuestion } from '../../notch/simulation/types'

export type FDETurnOutput = {
  signals: ExtractedSignal[]
  technicalQuestion?: TechnicalQuestion
  loadBearingGap?: LoadBearingGap
}

const SIGNAL_RULES: Array<{ type: ExtractedSignal['type']; re: RegExp }> = [
  { type: 'blocker', re: /\b(blocker|blocked|stalled|risk|can't|cannot)\b/i },
  { type: 'budget', re: /\b(\$[\d,.]+|budget|acv|approved)\b/i },
  { type: 'timeline', re: /\b(q[1-4]|timeline|deadline|by end of|this quarter|go live)\b/i },
  { type: 'technical', re: /\b(gdpr|scc|api|webhook|latency|retry|dead.?letter|infra|security|residency)\b/i },
  { type: 'champion', re: /\b(champion|sarah|owner|driving eval)\b/i },
  { type: 'motion', re: /\b(next step|follow up|send|schedule|pilot)\b/i }
]

const TECH_QUESTION_RE = /\?/
const TECH_SCOPE_RE = /\b(gdpr|scc|api|webhook|retry|dead.?letter|data residency|security|infrastructure)\b/i

export class FDEExtractor {
  private recentSignals = new Set<string>()

  reset(): void {
    this.recentSignals.clear()
  }

  processChunk(input: { speaker: string; text: string }): FDETurnOutput {
    const text = input.text.trim()
    const out: FDETurnOutput = { signals: [] }

    for (const rule of SIGNAL_RULES) {
      if (!rule.re.test(text)) continue
      const key = `${rule.type}:${text.toLowerCase()}`
      if (this.recentSignals.has(key)) continue
      this.recentSignals.add(key)
      out.signals.push({
        type: rule.type,
        content: text,
        confidence: 0.82,
        speaker: input.speaker
      })
    }

    if (TECH_QUESTION_RE.test(text) && TECH_SCOPE_RE.test(text)) {
      out.technicalQuestion = {
        question: text,
        response:
          'We can keep this in Frankfurt with scoped retry defaults for V1. Confirm their exact failover requirement, then commit only to in-region queue + DLQ for pilot.',
        sources: ['transcript-live', 'fde-extractor']
      }
    }

    if (/timeline|go live|end of q/i.test(text) && !/success|criteria|definition/i.test(text)) {
      out.loadBearingGap = {
        content: 'Pilot success definition still open before timeline commitment',
        urgency: 'high'
      }
    }

    return out
  }
}
