import { useEffect, useMemo, useState } from 'react'
import type { StreamSource } from '@shared/types'
import {
  BUILTIN_STREAMS,
  FEED_SOURCE_GROUPS,
  loadActiveStreamId,
  loadCustomStreams,
  newStreamId,
  saveActiveStreamId,
  saveCustomStreams,
  sourceLabel,
  type FeedStream
} from './feedStreamsStore'

type Props = {
  activeStreamId: string
  onStreamChange: (id: string) => void
}

const PRESET_STREAMS = BUILTIN_STREAMS.filter((s) => s.id !== 'all')

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

  const closeCreator = () => {
    setCreating(false)
    setDraftLabel('')
    setDraftSources(new Set(['gmail', 'slack']))
  }

  const toggleDraftSource = (source: StreamSource) => {
    setDraftSources((prev) => {
      const next = new Set(prev)
      if (next.has(source)) next.delete(source)
      else next.add(source)
      return next
    })
  }

  const applyPreset = (sources: StreamSource[]) => {
    setDraftSources(new Set(sources))
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
    closeCreator()
  }

  const deleteStream = (id: string) => {
    const next = customStreams.filter((s) => s.id !== id)
    setCustomStreams(next)
    saveCustomStreams(next)
    if (activeStreamId === id) onStreamChange('all')
  }

  const isCustom = (id: string) => customStreams.some((s) => s.id === id)
  const canSave = draftLabel.trim().length > 0 && draftSources.size > 0

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
          className={`x-feed-stream-chip x-feed-stream-add${creating ? ' active' : ''}`}
          aria-expanded={creating}
          onClick={() => (creating ? closeCreator() : setCreating(true))}
        >
          {creating ? 'Cancel' : '+ Stream'}
        </button>
      </div>

      {creating ? (
        <div className="x-feed-stream-create">
          <div className="x-feed-stream-create-head">
            <input
              className="x-feed-stream-input"
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              placeholder="Name your stream"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSave) saveCustomStream()
                if (e.key === 'Escape') closeCreator()
              }}
            />
            <button
              type="button"
              className="x-feed-stream-save"
              disabled={!canSave}
              onClick={saveCustomStream}
            >
              Save
            </button>
          </div>

          <div className="x-feed-stream-presets">
            <span className="x-feed-stream-presets-label">Start from</span>
            {PRESET_STREAMS.map((preset, i) => (
              <span key={preset.id} className="x-feed-stream-preset-wrap">
                {i > 0 ? <span className="x-feed-stream-preset-sep" aria-hidden>·</span> : null}
                <button
                  type="button"
                  className="x-feed-stream-preset"
                  onClick={() => applyPreset(preset.sources)}
                >
                  {preset.label}
                </button>
              </span>
            ))}
            <span className="x-feed-stream-source-count">
              {draftSources.size} selected
            </span>
          </div>

          <div className="x-feed-stream-groups">
            {FEED_SOURCE_GROUPS.map((group) => (
              <div key={group.id} className="x-feed-stream-group">
                <span className="x-feed-stream-group-label">{group.label}</span>
                <div className="x-feed-stream-group-toggles">
                  {group.sources.map((source) => {
                    const on = draftSources.has(source)
                    return (
                      <button
                        key={source}
                        type="button"
                        className={`x-feed-stream-toggle${on ? ' active' : ''}`}
                        aria-pressed={on}
                        onClick={() => toggleDraftSource(source)}
                      >
                        {sourceLabel(source)}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
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
