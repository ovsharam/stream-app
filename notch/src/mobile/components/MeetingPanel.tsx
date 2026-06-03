import { useEffect, useState } from 'react'
import { openBrowserLink } from '../../lib/api'

const API = 'http://localhost:3131'

type MeetingState = {
  active: boolean
  session: {
    id: string
    startedAt: number
    chunkCount: number
    signalCount: number
    starredCount: number
    latestChunks: string[]
    title?: string
    dealHint?: string
  } | null
  prediction: {
    id: string
    signalText: string
    sayThis: string
    followUp: string
    flag?: string
    ts: number
  } | null
}

async function fetchState(): Promise<MeetingState | null> {
  try {
    const res = await fetch(`${API}/api/meeting/state`, { credentials: 'include' })
    if (!res.ok) return null
    return (await res.json()) as MeetingState
  } catch {
    return null
  }
}

function formatElapsed(startedAt: number): string {
  const sec = Math.floor((Date.now() - startedAt) / 1000)
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

type AudioStatus = {
  running: boolean
  whisperReady: boolean
  lastChunkAt?: number
  error?: string
}

export function MeetingPanel() {
  const [state, setState] = useState<MeetingState | null>(null)
  const [audio, setAudio] = useState<AudioStatus | null>(null)
  const [endingResult, setEndingResult] = useState<{
    googleDocUrl?: string
    googleDocError?: string
    extraction?: { summary: string; scopeDecision: string; nextSteps: string[] }
  } | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancel = false
    const load = async () => {
      const s = await fetchState()
      if (!cancel) setState(s)
      const a = await window.notch?.audio?.status?.().catch(() => null)
      if (!cancel && a) setAudio(a as AudioStatus)
    }
    void load()
    const t = setInterval(load, 3000)
    const onChunk = window.notch?.meeting?.onChunk?.(() => void load())
    const onSignal = window.notch?.meeting?.onSignal?.(() => void load())
    const onStarted = window.notch?.meeting?.onStarted?.(() => {
      setEndingResult(null)
      void load()
    })
    const onEnded = window.notch?.meeting?.onEnded?.((result) => {
      const r = result as {
        googleDocUrl?: string
        googleDocError?: string
        extraction?: { summary: string; scopeDecision: string; nextSteps: string[] }
      }
      setEndingResult(r)
      void load()
    })
    return () => {
      cancel = true
      clearInterval(t)
      onChunk?.()
      onSignal?.()
      onStarted?.()
      onEnded?.()
    }
  }, [])

  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  if (!state) return null

  const startMeeting = async () => {
    await window.notch?.meeting?.start?.()
  }
  const endMeeting = async () => {
    await window.notch?.meeting?.end?.()
  }
  const starMoment = async () => {
    await window.notch?.meeting?.star?.()
  }

  const renderAudioStatus = () => {
    if (!audio) return null
    if (!audio.whisperReady) {
      return (
        <p className="meeting-audio-warn">
          ⚠ whisper not installed — open tray → Setup meeting transcription
        </p>
      )
    }
    if (!audio.running) {
      return <p className="meeting-audio-info">whisper installed · audio tap idle</p>
    }
    const last = audio.lastChunkAt
      ? `${Math.floor((Date.now() - audio.lastChunkAt) / 1000)}s ago`
      : 'no chunks yet'
    return <p className="meeting-audio-ok">● audio tap running · last chunk {last}</p>
  }

  if (!state.active) {
    return (
      <div className="meeting-panel meeting-panel-idle">
        <div className="meeting-row">
          <span className="meeting-status">○ no meeting</span>
          <button type="button" className="meeting-cta" onClick={() => void startMeeting()}>
            Start capture (⌘⇧L)
          </button>
        </div>
        {renderAudioStatus()}
        {endingResult && (
          <div className="meeting-result">
            <p className="meeting-result-title">Last meeting · synced</p>
            {endingResult.extraction && (
              <p className="meeting-result-summary">
                {endingResult.extraction.summary.slice(0, 140)}
                {endingResult.extraction.summary.length > 140 ? '…' : ''}
              </p>
            )}
            {endingResult.googleDocUrl ? (
              <a
                className="meeting-result-doc"
                href={endingResult.googleDocUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => {
                  e.preventDefault()
                  openBrowserLink(endingResult.googleDocUrl!, { title: 'Meeting notes', source: 'gdocs' })
                }}
              >
                Open Google Doc ↗
              </a>
            ) : endingResult.googleDocError ? (
              <p className="meeting-result-error">Doc: {endingResult.googleDocError}</p>
            ) : null}
          </div>
        )}
      </div>
    )
  }

  const s = state.session!
  void tick

  return (
    <div className="meeting-panel meeting-panel-live">
      <div className="meeting-row">
        <span className="meeting-status meeting-live">● live</span>
        <span className="meeting-timer">{formatElapsed(s.startedAt)}</span>
        <span className="meeting-counts">
          {s.chunkCount} chunks · {s.signalCount} signals · {s.starredCount} ★
        </span>
        <div className="meeting-actions">
          <button type="button" className="meeting-star" onClick={() => void starMoment()}>
            ★
          </button>
          <button type="button" className="meeting-end" onClick={() => void endMeeting()}>
            End (⌘⇧K)
          </button>
        </div>
      </div>
      {renderAudioStatus()}

      {state.prediction && (
        <div className="meeting-prediction">
          <p className="meeting-prediction-label">Pre-loaded answer</p>
          <p className="meeting-prediction-signal">› {state.prediction.signalText}</p>
          <p className="meeting-prediction-say">{state.prediction.sayThis}</p>
          {state.prediction.followUp && (
            <p className="meeting-prediction-follow">Follow up: {state.prediction.followUp}</p>
          )}
          {state.prediction.flag && (
            <p className="meeting-prediction-flag">⚠ {state.prediction.flag}</p>
          )}
        </div>
      )}

      {s.latestChunks.length > 0 && (
        <div className="meeting-transcript">
          <p className="meeting-transcript-label">Live transcript</p>
          {s.latestChunks.slice(-4).map((line, i) => (
            <p key={i} className="meeting-transcript-line">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}
