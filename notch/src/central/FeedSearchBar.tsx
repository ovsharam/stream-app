import { useCallback, useEffect, useRef, useState } from 'react'
import type { CentralStreamEvent, ClusterSearchHit } from '@shared/cluster'
import { clusterApi } from '../lib/api'
import { IconSearch } from './Icons'

type Props = {
  query: string
  onQueryChange: (q: string) => void
  matchCount: number
  totalCount: number
  onSelectHit: (hit: ClusterSearchHit) => void
}

export function FeedSearchBar({ query, onQueryChange, matchCount, totalCount, onSelectHit }: Props) {
  const [hits, setHits] = useState<ClusterSearchHit[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const searchGenRef = useRef(0)

  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim()
    if (!trimmed) {
      setHits([])
      setSearching(false)
      return
    }
    const gen = ++searchGenRef.current
    setSearching(true)
    try {
      const results = await clusterApi.search(trimmed)
      if (gen !== searchGenRef.current) return
      setHits(results)
    } catch {
      if (gen === searchGenRef.current) setHits([])
    } finally {
      if (gen === searchGenRef.current) setSearching(false)
    }
  }, [])

  useEffect(() => {
    if (!query.trim()) {
      searchGenRef.current += 1
      setHits([])
      setSearching(false)
      return
    }
    const t = window.setTimeout(() => void runSearch(query), 180)
    return () => window.clearTimeout(t)
  }, [query, runSearch])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const showDropdown = open && query.trim().length > 0

  return (
    <div className="x-feed-search" ref={wrapRef}>
      <IconSearch className="x-feed-search-icon" />
      <input
        ref={inputRef}
        className="x-feed-search-input"
        value={query}
        placeholder="Search feed…  / or ⌘K"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onQueryChange(e.target.value)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            searchGenRef.current += 1
            onQueryChange('')
            setOpen(false)
            inputRef.current?.blur()
          }
        }}
      />
      {query.trim() ? (
        <span className="x-feed-search-count">
          {matchCount}/{totalCount}
        </span>
      ) : null}
      {showDropdown ? (
        <div className="x-feed-search-dropdown" role="listbox">
          {searching && hits.length === 0 ? (
            <p className="x-feed-search-empty">Searching…</p>
          ) : null}
          {!searching && hits.length === 0 ? (
            <p className="x-feed-search-empty">No matches in stream</p>
          ) : null}
          {hits.slice(0, 10).map((hit) => (
            <button
              key={hit.id}
              type="button"
              role="option"
              className="x-feed-search-hit"
              onClick={() => {
                onSelectHit(hit)
                setOpen(false)
              }}
            >
              <span className="x-feed-search-hit-source">{hit.source}</span>
              <span className="x-feed-search-hit-title">{hit.title}</span>
              <span className="x-feed-search-hit-snippet">{hit.snippet}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function filterFeedEvents(events: CentralStreamEvent[], query: string): CentralStreamEvent[] {
  const q = query.trim().toLowerCase()
  if (!q) return events
  const terms = q.split(/\s+/).filter((w) => w.length > 1)
  return events.filter((e) => {
    const hay = `${e.title} ${e.body} ${e.source} ${e.speaker ?? ''}`.toLowerCase()
    return hay.includes(q) || (terms.length > 0 && terms.every((t) => hay.includes(t)))
  })
}
