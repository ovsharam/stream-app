import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  formatComposeHighlight,
  getActiveComposeContext,
  type ComposeSuggestion
} from '@shared/compose'

type Props = {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  placeholder?: string
  rows?: number
  className?: string
}

export function ComposeInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  rows = 3,
  className = ''
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLDivElement>(null)
  const [cursor, setCursor] = useState(0)

  const highlightHtml = useMemo(() => formatComposeHighlight(value), [value])

  const context = useMemo(
    () => getActiveComposeContext(value, cursor),
    [value, cursor]
  )

  const syncScroll = useCallback(() => {
    const ta = textareaRef.current
    const hl = highlightRef.current
    if (!ta || !hl) return
    hl.scrollTop = ta.scrollTop
    hl.scrollLeft = ta.scrollLeft
  }, [])

  const syncCursor = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    setCursor(ta.selectionStart ?? value.length)
  }, [value.length])

  useEffect(() => {
    syncScroll()
  }, [value, syncScroll])

  const applySuggestion = (suggestion: ComposeSuggestion) => {
    const ctx = getActiveComposeContext(value, cursor)
    if (!ctx) return
    const prefix = value.slice(0, ctx.tagStart)
    const afterAt = `@${ctx.providerToken}`
    const suffix = value.slice(cursor)
    const spacer = suggestion.insert && !suggestion.insert.startsWith(' ') ? ' ' : ''
    const next = `${prefix}${afterAt}${spacer}${suggestion.insert}${suffix}`
    onChange(next)
    const newCursor = `${prefix}${afterAt}${spacer}${suggestion.insert}`.length
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(newCursor, newCursor)
      setCursor(newCursor)
    })
  }

  return (
    <div className={`x-compose-input-shell ${className}`.trim()}>
      <div className="x-compose-input-wrap">
        <div
          ref={highlightRef}
          className="x-compose-input-highlight"
          aria-hidden
          dangerouslySetInnerHTML={{ __html: highlightHtml || '<br/>' }}
        />
        <textarea
          ref={textareaRef}
          value={value}
          rows={rows}
          className="x-compose-input x-compose-input-overlay"
          placeholder={placeholder}
          spellCheck
          onChange={(e) => {
            onChange(e.target.value)
            setCursor(e.target.selectionStart ?? e.target.value.length)
          }}
          onSelect={syncCursor}
          onKeyUp={syncCursor}
          onClick={syncCursor}
          onScroll={syncScroll}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              onSubmit?.()
            }
            if (e.key === 'Tab' && context?.suggestions[0]) {
              e.preventDefault()
              applySuggestion(context.suggestions[0])
            }
          }}
        />
      </div>
      {context && context.suggestions.length > 0 ? (
        <div className="x-compose-suggestions" role="listbox" aria-label={`${context.provider} commands`}>
          {context.suggestions.map((s) => (
            <button
              key={`${context.provider}-${s.label}`}
              type="button"
              role="option"
              className="x-compose-suggestion"
              title={s.hint}
              onMouseDown={(e) => {
                e.preventDefault()
                applySuggestion(s)
              }}
            >
              <span className="x-compose-suggestion-label">{s.label}</span>
              {s.hint ? <span className="x-compose-suggestion-hint">{s.hint}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
