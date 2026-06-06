import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AssistResult, ClusterSearchHit } from '@shared/cluster'

export type HomeChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  query?: string
  hits?: ClusterSearchHit[]
  assist?: AssistResult
  loading?: boolean
  error?: string
}

export type HomeChatSession = {
  id: string
  title: string
  messages: HomeChatMessage[]
  createdAt: number
  updatedAt: number
}

const SESSIONS_KEY = 'notch.homeChat.sessions'
const ACTIVE_KEY = 'notch.homeChat.activeId'

function loadSessions(): HomeChatSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as HomeChatSession[]
    return Array.isArray(parsed)
      ? parsed
          .filter((s) => s.messages?.length > 0)
          .map((s) => ({
            ...s,
            messages: s.messages.map((m) =>
              m.loading
                ? { ...m, loading: false, error: m.error ?? 'Request interrupted.' }
                : m
            )
          }))
      : []
  } catch {
    return []
  }
}

function saveSessions(sessions: HomeChatSession[]) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions))
}

function saveActiveId(id: string | null) {
  if (id) localStorage.setItem(ACTIVE_KEY, id)
  else localStorage.removeItem(ACTIVE_KEY)
}

export function sessionTitle(messages: HomeChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user' && m.content.trim())
  if (!first) return 'New chat'
  const t = first.content.trim()
  return t.length > 46 ? `${t.slice(0, 45)}…` : t
}

function newSessionId(): string {
  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

export function useHomeChatSessions(onRailChange?: (open: boolean) => void) {
  const [sessions, setSessions] = useState<HomeChatSession[]>(() => loadSessions())
  const [activeId, setActiveId] = useState<string | null>(null)
  const [draftMessages, setDraftMessages] = useState<HomeChatMessage[]>([])
  const activeIdRef = useRef(activeId)
  const draftRef = useRef(draftMessages)
  activeIdRef.current = activeId
  draftRef.current = draftMessages

  useEffect(() => {
    saveActiveId(null)
  }, [])

  const listedSessions = useMemo(
    () => sessions.filter((s) => s.messages.length > 0),
    [sessions]
  )

  const activeSession = useMemo(
    () => (activeId ? sessions.find((s) => s.id === activeId) : undefined),
    [activeId, sessions]
  )

  const messages = activeSession?.messages ?? draftMessages
  const hasThread = messages.length > 0
  const showRail = hasThread || listedSessions.length > 0

  useEffect(() => {
    onRailChange?.(showRail)
  }, [showRail, onRailChange])

  const setMessages = useCallback(
    (updater: HomeChatMessage[] | ((prev: HomeChatMessage[]) => HomeChatMessage[])) => {
      setSessions((prevSessions) => {
        const id = activeIdRef.current
        const current = id
          ? prevSessions.find((s) => s.id === id)?.messages ?? []
          : draftRef.current
        const next = typeof updater === 'function' ? updater(current) : updater

        if (!id) {
          if (next.length === 0) {
            setDraftMessages([])
            draftRef.current = []
            return prevSessions
          }
          const sessionId = newSessionId()
          const session: HomeChatSession = {
            id: sessionId,
            title: sessionTitle(next),
            messages: next,
            createdAt: Date.now(),
            updatedAt: Date.now()
          }
          activeIdRef.current = sessionId
          setActiveId(sessionId)
          saveActiveId(sessionId)
          setDraftMessages([])
          draftRef.current = []
          const merged = [session, ...prevSessions]
          saveSessions(merged)
          return merged
        }

        const merged = prevSessions.some((s) => s.id === id)
          ? prevSessions.map((s) =>
              s.id === id
                ? {
                    ...s,
                    messages: next,
                    title: sessionTitle(next),
                    updatedAt: Date.now()
                  }
                : s
            )
          : [
              {
                id,
                title: sessionTitle(next),
                messages: next,
                createdAt: Date.now(),
                updatedAt: Date.now()
              },
              ...prevSessions
            ]
        saveSessions(merged)
        return merged
      })
    },
    []
  )

  const newChat = useCallback(() => {
    setDraftMessages([])
    activeIdRef.current = null
    setActiveId(null)
    saveActiveId(null)
  }, [])

  const selectSession = useCallback((id: string) => {
    setDraftMessages([])
    activeIdRef.current = id
    setActiveId(id)
    saveActiveId(id)
  }, [])

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const next = prev.filter((s) => s.id !== id)
        saveSessions(next)
        return next
      })
      if (activeIdRef.current === id) {
        setDraftMessages([])
        activeIdRef.current = null
        setActiveId(null)
        saveActiveId(null)
      }
    },
    []
  )

  return {
    sessions: listedSessions,
    activeId,
    messages,
    hasThread,
    showRail,
    setMessages,
    newChat,
    selectSession,
    deleteSession
  }
}

export type HomeChatSessionGroup = {
  label: string
  sessions: HomeChatSession[]
}

export function groupSessionsByDate(sessions: HomeChatSession[]): HomeChatSessionGroup[] {
  const sorted = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt)
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const now = new Date()
  const today = startOfDay(now)
  const yesterday = today - 86_400_000
  const weekAgo = today - 7 * 86_400_000

  const buckets: Record<string, HomeChatSession[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 days': [],
    Older: []
  }

  for (const session of sorted) {
    const t = startOfDay(new Date(session.updatedAt))
    if (t >= today) buckets.Today.push(session)
    else if (t >= yesterday) buckets.Yesterday.push(session)
    else if (t >= weekAgo) buckets['Previous 7 days'].push(session)
    else buckets.Older.push(session)
  }

  return (['Today', 'Yesterday', 'Previous 7 days', 'Older'] as const)
    .map((label) => ({ label, sessions: buckets[label] }))
    .filter((g) => g.sessions.length > 0)
}
