import { create } from 'zustand'
import type { StreamSource } from '@shared/types'
import { api, type ConnectionsResponse } from '@/lib/api'

interface AuthState {
  connections: Record<ConnectableSource, boolean>
  configured: Partial<Record<StreamSource, boolean>>
  connected: Partial<Record<StreamSource, boolean>>
  onboardingComplete: boolean
  isLoading: boolean

  load: () => Promise<void>
  setOnboardingComplete: () => Promise<void>
  refresh: () => Promise<void>
  hasAnyConnection: () => boolean
  shouldShowOnboarding: () => boolean
}

type ConnectableSource = 'gmail' | 'slack' | 'x' | 'perplexity'

const emptyConnections = (): Record<ConnectableSource, boolean> => ({
  gmail: false,
  slack: false,
  x: false,
  perplexity: false
})

function applyResponse(
  set: (partial: Partial<AuthState>) => void,
  data: ConnectionsResponse
): void {
  set({
    connections: { ...emptyConnections(), ...data.connections },
    configured: data.configured,
    connected: data.connected,
    onboardingComplete: data.onboardingComplete,
    isLoading: false
  })
}

export const useAuthStore = create<AuthState>((set, get) => ({
  connections: emptyConnections(),
  configured: {},
  connected: {},
  onboardingComplete: false,
  isLoading: true,

  load: async () => {
    try {
      const data = await api.getConnections()
      applyResponse(set, data)
    } catch {
      set({ isLoading: false })
    }
  },

  setOnboardingComplete: async () => {
    await api.completeOnboarding()
    set({ onboardingComplete: true })
  },

  refresh: async () => {
    const data = await api.getConnections()
    applyResponse(set, data)
  },

  hasAnyConnection: () => {
    const { connected } = get()
    return Object.values(connected).some(Boolean)
  },

  shouldShowOnboarding: () => {
    if (
      typeof process !== 'undefined' &&
      process.env.NEXT_PUBLIC_INTERACTIVE_DEMO === '1'
    ) {
      return false
    }
    const { onboardingComplete, isLoading } = get()
    if (isLoading) return false
    return !onboardingComplete
  }
}))
