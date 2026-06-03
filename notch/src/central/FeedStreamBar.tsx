import { useEffect, useMemo, useState } from 'react'
import type { StreamSource } from '@shared/types'
import {
  BUILTIN_STREAMS,
  FEED_SOURCE_OPTIONS,
  loadActiveStreamId,
  loadCustomStreams,
  newStreamId,
  saveActiveStreamId,
  saveCustomStreams,
  type FeedStream
} from './feedStreamsStore'

type Props = {
  activeStreamId: string
  onStreamChange: (id: string) => void
}

export function FeedStreamBar({ activeStreamId, onStreamChange }: Props) {
  const [customStreams, setCustomStreams] = useState<FeedStream[]>(() => loadCustomStreams())
  const [creating, setCreating] = useState(false)
  const [draftLabel, setDraftLabel] = useState('')
  const [draftSources, setDraftSources] = useState<Set<StreamSource>>(
    () => new Set(['gmail', 'slack'])
  )

  useEffect(() => {
    saveActiveStreamId(activeStreamId)
  }, [activeStreamId])

  const streams = useMemo(() => {
    const builtinIds = new Set(BUILTIN_STREAMS.map((s) => s.id))
    const seen = new Set<string>()
    const customs = customStreams.filter((s) => {
      if (builtinIds.has(s.id) || seen.has(s.id)) return false
      seen.add(s.id)
      return true
    })
    return [...BUILTIN_STREAMS.filter((s) => s.id !== 'all'), ...customs]
  }, [customStreams])

  const toggleDraftSource = (source: StreamSource) => {
    setDraftSources((prev) => {
      const next = new Set(prev)
      if (next.has(source)) next.delete(source)
      else next.add(source)
      return next
    })
  }

  const saveCustomStream = () => {
    const label = draftLabel.trim()
    if (!label || draftSources.size === 0) return
    const stream: FeedStream = {
      id: newStreamId(),
      label,
      sources: [...draftSources]
    }
    const next = [...customStreams, stream]
    setCustomStreams(next)
    saveCustomStreams(next)
    onStreamChange(stream.id)
    setCreating(false)
    setDraftLabel('')
    setDraftSources(new Set(['gmail', 'slack']))
  }

  const deleteStream = (id: string) => {
    const next = customStreams.filter((s) => s.id !== id)
    setCustomStreams(next)
    saveCustomStreams(next)
    if (activeStreamId === id) onStreamChange('all')
  }

  const isCustom = (id: string) => customStreams.some((s) => s.id === id)

  return (
    <div className="x-feed-streams">
      <div className="x-feed-streams-row" role="tablist" aria-label="Feed streams">
        <button
          type="button"
          role="tab"
          aria-selected={activeStreamId === 'all'}
          className={`x-feed-stream-chip ${activeStreamId === 'all' ? 'active' : ''}`}
          onClick={() => onStreamChange('all')}
        >
          All
        </button>
        {streams.map((stream) => {
          const active = activeStreamId === stream.id
          const custom = isCustom(stream.id)
          if (custom && active) {
            return (
              <span
                key={stream.id}
                role="tab"
                aria-selected
                className="x-feed-stream-chip active x-feed-stream-chip--custom"
              >
                <button
                  type="button"
                  className="x-feed-stream-chip-label"
                  onClick={() => onStreamChange(stream.id)}
                >
                  {stream.label}
                </button>
                <button
                  type="button"
                  className="x-feed-stream-del"
                  aria-label={`Remove ${stream.label} stream`}
                  onClick={() => deleteStream(stream.id)}
                >
                  ×
                </button>
              </span>
            )
          }
          return (
            <button
              key={stream.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`x-feed-stream-chip ${active ? 'active' : ''}`}
              onClick={() => onStreamChange(stream.id)}
            >
              {stream.label}
            </button>
          )
        })}
        <button
          type="button"
          className="x-feed-stream-chip x-feed-stream-add"
          aria-expanded={creating}
          onClick={() => setCreating((v) => !v)}
        >
          + Stream
        </button>
      </div>

      {creating ? (
        <div className="x-feed-stream-create">
          <input
            className="x-feed-stream-input"
            value={draftLabel}
            onChange={(e) => setDraftLabel(e.target.value)}
            placeholder="Stream name — e.g. Comms only"
          />
          <div className="x-feed-stream-sources">
            {FEED_SOURCE_OPTIONS.map((opt) => (
              <label key={opt.id} className="x-feed-stream-source">
                <input
                  type="checkbox"
                  checked={draftSources.has(opt.id)}
                  onChange={() => toggleDraftSource(opt.id)}
                />
                {opt.label}
              </label>
            ))}
          </div>
          <div className="x-feed-stream-create-actions">
            <button
              type="button"
              className="x-feed-stream-save"
              disabled={!draftLabel.trim() || draftSources.size === 0}
              onClick={saveCustomStream}
            >
              Save stream
            </button>
            <button type="button" className="x-feed-stream-cancel" onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export function useFeedStreamId(): [string, (id: string) => void] {
  const [id, setId] = useState(loadActiveStreamId)
  return [id, setId]
}
