import { GraphStore } from '../../notch/graph/GraphStore'
import { SimulationEngine } from '../../notch/simulation/SimulationEngine'
import type {
  DealFixture,
  ExtractedSignal,
  LoadBearingGap,
  PostCallSummary,
  TechnicalQuestion
} from '../../notch/simulation/types'
import { FDEExtractor } from '../fde/FDEExtractor'

let engine: SimulationEngine | null = null
let graph: GraphStore | null = null
let callActive = false
let transcript: { speaker: string; text: string }[] = []
let lastTechnical: TechnicalQuestion | null = null
let lastGap: LoadBearingGap | null = null
let signals: ExtractedSignal[] = []
let currentSessionId = 'session-acme-discovery-2'
const fde = new FDEExtractor()

function getEngine(): SimulationEngine {
  if (!engine) engine = new SimulationEngine('live-call-demo')
  return engine
}

function getGraph(): GraphStore {
  if (!graph) graph = new GraphStore()
  return graph
}

export async function bootstrapSimGraph(): Promise<void> {
  const eng = getEngine()
  const store = getGraph()
  const dealIds = ['acme-corp', 'pineapple-inc', 'redwood-hq']
  await Promise.all(
    dealIds.map(async (id) => {
      const deal: DealFixture = await eng.getDealContext(id)
      store.ingestDeal(deal)
    })
  )
}

export function isSimCallActive(): boolean {
  return callActive
}

export function getSimTranscript(): { speaker: string; text: string }[] {
  return [...transcript]
}

export function getSimSignals(): ExtractedSignal[] {
  return [...signals]
}

export function getSimIntel(): { technical: TechnicalQuestion | null; gap: LoadBearingGap | null } {
  return { technical: lastTechnical, gap: lastGap }
}

export function getGraphSignals(dealId: string): ExtractedSignal[] {
  return getGraph().getSignalsForDeal(dealId)
}

export function startSimCall(callId = 'acme-discovery-2'): void {
  const eng = getEngine()
  eng.stopCallReplay()
  callActive = true
  transcript = []
  signals = []
  lastTechnical = null
  lastGap = null
  currentSessionId = `session-${callId}-${Date.now()}`
  fde.reset()

  eng.startCallReplay(callId, {
    onTranscriptChunk: (speaker, text) => {
      transcript.push({ speaker, text })
      if (transcript.length > 20) transcript.shift()

      const out = fde.processChunk({ speaker, text })
      if (out.signals.length) {
        signals.push(...out.signals)
        getGraph().addSessionSignals('acme-corp', currentSessionId, out.signals)
      }
      if (out.technicalQuestion) lastTechnical = out.technicalQuestion
      if (out.loadBearingGap) lastGap = out.loadBearingGap
    },
    onTechnicalQuestion: (q) => {
      lastTechnical = q
    },
    onLoadBearingGap: (gap) => {
      lastGap = gap
    },
    onSignalDetected: (s) => {
      signals.push(s)
      getGraph().addSessionSignals('acme-corp', currentSessionId, [s])
    },
    onCallEnd: (summary: PostCallSummary) => {
      callActive = false
      getGraph().saveSession(
        currentSessionId,
        'acme-corp',
        'post_call',
        transcript.map((l) => `${l.speaker}: ${l.text}`).join('\n'),
        summary.summary,
        signals
      )
    }
  })
}

export function stopSimCall(): void {
  getEngine().stopCallReplay()
  callActive = false
}

export { getEngine }
