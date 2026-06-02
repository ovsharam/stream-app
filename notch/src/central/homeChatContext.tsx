import { createContext, useContext, type ReactNode } from 'react'
import { useHomeChatSessions } from './homeChatStore'

export type HomeChatContextValue = ReturnType<typeof useHomeChatSessions>

const HomeChatContext = createContext<HomeChatContextValue | null>(null)

export function HomeChatProvider({
  children,
  onRailChange
}: {
  children: ReactNode
  onRailChange?: (open: boolean) => void
}) {
  const value = useHomeChatSessions(onRailChange)
  return <HomeChatContext.Provider value={value}>{children}</HomeChatContext.Provider>
}

export function useHomeChat(): HomeChatContextValue {
  const ctx = useContext(HomeChatContext)
  if (!ctx) throw new Error('useHomeChat must be used within HomeChatProvider')
  return ctx
}
