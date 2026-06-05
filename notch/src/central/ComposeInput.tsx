import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  filterComposeMentionTargets,
  getActiveComposeContext,
  getComposeMentionDraft,
  listComposeMentionTargets,
  type ComposeMentionTarget,
  type ComposeSuggestion
} from '@shared/compose'

type Props = {
  value: string
  onChange: (value: string) => void
  onSubmit?: () => void
  placeholder?: string
  rows?: number
  className?: string
  /** Extra @mention targets (MCP agents, contacts, etc.) */
  mentionTargets?: ComposeMentionTarget[]
}

type MenuItem =
  | { kind: 'mention'; target: ComposeMentionTarget }
  | { kind: 'command'; suggestion: ComposeSuggestion; provider: string }

export function ComposeInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  rows = 3,
  className = '',
  mentionTargets = []
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [cursor, setCursor] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)

  const allMentionTargets = useMemo(
    () => listComposeMentionTargets(mentionTargets),
    [mentionTargets]
  )

  const mentionDraft = useMemo(
    () => getComposeMentionDraft(value, cursor),
    [value, cursor]
  )

  const commandContext = useMemo(
    () => getActiveComposeContext(value, cursor),
    [value, cursor]
  )

  const menuItems = useMemo((): MenuItem[] => {
    if (mentionDraft) {
      return filterComposeMentionTargets(mentionDraft.query, allMentionTargets).map(
        (target) => ({ kind: 'mention', target })
      )
    }
    if (commandContext?.suggestions.length) {
      return commandContext.suggestions.map((suggestion) => ({
        kind: 'command',
        suggestion,
        provider: commandContext.provider
      }))
    }
    return []
  }, [mentionDraft, allMentionTargets, commandContext])

  const mentionEmptyHint =
    mentionDraft &&
    mentionDraft.query.length > 0 &&
    menuItems.length === 0 &&
    !allMentionTargets.some((t) => t.kind === 'person')
      ? 'No contacts loaded — Apps → Gmail → Sync contacts (reconnect Gmail first if 0).'
      : mentionDraft && mentionDraft.query.length > 0 && menuItems.length === 0
        ? `No match for "@${mentionDraft.query}" — sync contacts in Apps → Gmail.`
        : null

  useEffect(() => {
    setActiveIndex(0)
  }, [menuItems.length, mentionDraft?.query, commandContext?.rest])

  const syncCursor = useCallback(() => {
    const ta = textareaRef.current
    if (!ta) return
    setCursor(ta.selectionStart ?? value.length)
  }, [value.length])

  const replaceRange = (start: number, end: number, insert: string) => {
    const next = `${value.slice(0, start)}${insert}${value.slice(end)}`
    onChange(next)
    const newCursor = start + insert.length
    requestAnimationFrame(() => {
      const ta = textareaRef.current
      if (!ta) return
      ta.focus()
      ta.setSelectionRange(newCursor, newCursor)
      setCursor(newCursor)
    })
  }

  const applyMention = (target: ComposeMentionTarget) => {
    if (!mentionDraft) return
    replaceRange(mentionDraft.start, mentionDraft.end, `@${target.token} `)
  }

  const applyCommand = (suggestion: ComposeSuggestion) => {
    const ctx = getActiveComposeContext(value, cursor)
    if (!ctx) return
    const afterAt = `@${ctx.providerToken}`
    const spacer = suggestion.insert && !suggestion.insert.startsWith(' ') ? ' ' : ''
    replaceRange(ctx.tagStart, cursor, `${afterAt}${spacer}${suggestion.insert}`)
  }

  const applyActiveItem = () => {
    const item = menuItems[activeIndex]
    if (!item) return
    if (item.kind === 'mention') applyMention(item.target)
    else applyCommand(item.suggestion)
  }

  return (
    <div className={`x-compose-input-shell ${className}`.trim()}>
      <div className="x-compose-input-wrap">
        <textarea
          ref={textareaRef}
          value={value}
          rows={rows}
          className="x-compose-input"
          placeholder={placeholder}
          spellCheck
          onChange={(e) => {
            onChange(e.target.value)
            setCursor(e.target.selectionStart ?? e.target.value.length)
          }}
          onSelect={syncCursor}
          onKeyUp={syncCursor}
          onClick={syncCursor}
          onKeyDown={(e) => {
            if (menuItems.length > 0) {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActiveIndex((i) => (i + 1) % menuItems.length)
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActiveIndex((i) => (i - 1 + menuItems.length) % menuItems.length)
                return
              }
              if (e.key === 'Tab' || (e.key === 'Enter' && !e.metaKey && !e.ctrlKey)) {
                e.preventDefault()
                applyActiveItem()
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                if (mentionDraft) {
                  replaceRange(mentionDraft.start, mentionDraft.end, '')
                }
                return
              }
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              onSubmit?.()
            }
          }}
        />
        {menuItems.length > 0 ? (
          <div
            className="x-compose-menu"
            role="listbox"
            aria-label={mentionDraft ? 'Mention suggestions' : 'Command suggestions'}
          >
            {menuItems.map((item, index) => {
              if (item.kind === 'mention') {
                return (
                  <button
                    key={`m-${item.target.kind}-${item.target.email ?? item.target.token}`}
                    type="button"
                    role="option"
                    aria-selected={index === activeIndex}
                    className={`x-compose-menu-item${index === activeIndex ? ' x-compose-menu-item-active' : ''}`}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      applyMention(item.target)
                    }}
                    onMouseEnter={() => setActiveIndex(index)}
                  >
                    <span className={`x-compose-menu-kind x-compose-menu-kind-${item.target.kind}`}>
                      {item.target.kind}
                    </span>
                    <span className="x-compose-menu-main">
                      <span className="x-compose-menu-label">@{item.target.token}</span>
                      <span className="x-compose-menu-name">{item.target.label}</span>
                    </span>
                    {item.target.hint ? (
                      <span className="x-compose-menu-hint">{item.target.hint}</span>
                    ) : null}
                  </button>
                )
              }
              return (
                <button
                  key={`c-${item.provider}-${item.suggestion.label}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`x-compose-menu-item${index === activeIndex ? ' x-compose-menu-item-active' : ''}`}
                  title={item.suggestion.hint}
                  onMouseDown={(e) => {
                    e.preventDefault()
                    applyCommand(item.suggestion)
                  }}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  <span className="x-compose-menu-kind x-compose-menu-kind-cmd">cmd</span>
                  <span className="x-compose-menu-main">
                    <span className="x-compose-menu-label">{item.suggestion.label}</span>
                  </span>
                  {item.suggestion.hint ? (
                    <span className="x-compose-menu-hint">{item.suggestion.hint}</span>
                  ) : null}
                </button>
              )
            })}
          </div>
        ) : mentionEmptyHint ? (
          <div className="x-compose-menu x-compose-menu-hint" role="status">
            {mentionEmptyHint}
          </div>
        ) : null}
      </div>
    </div>
  )
}
