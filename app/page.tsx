'use client'

import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { useStreamStore } from '@/store/streamStore'
import { useStreamSync } from '@/hooks/useStreamSync'
import { useInteractiveDemo, INTERACTIVE_DEMO } from '@/hooks/useInteractiveDemo'
import { api } from '@/lib/api'
import { cacheStreamItems, loadCachedStreamItems } from '@/lib/idb-cache'
import { Onboarding } from '@/components/Onboarding'
import { AppHeader } from '@/components/AppHeader'
import { FilterBar } from '@/components/FilterBar'
import { StreamFeed } from '@/components/StreamFeed'
import { AIBar } from '@/components/AIBar'
import { DemoSplash } from '@/components/DemoSplash'
import { DemoLiveBar } from '@/components/DemoLiveBar'
import { NotificationBannerStack } from '@/components/NotificationBanner'
import { MeetingContextPanel } from '@/components/MeetingContextPanel'
import { useMeetingDemo } from '@/hooks/useMeetingDemo'

export default function HomePage() {
  const loadAuth = useAuthStore((s) => s.load)
  const shouldShowOnboarding = useAuthStore((s) => s.shouldShowOnboarding)
  const isAuthLoading = useAuthStore((s) => s.isLoading)
  const setOnboardingComplete = useAuthStore((s) => s.setOnboardingComplete)
  const setItems = useStreamStore((s) => s.setItems)
  const setLoading = useStreamStore((s) => s.setLoading)

  const skipOnboarding = INTERACTIVE_DEMO
  const showStream =
    !isAuthLoading && (skipOnboarding || !shouldShowOnboarding())

  const { booting } = useInteractiveDemo(showStream)
  useMeetingDemo(showStream)
  useStreamSync(showStream && !INTERACTIVE_DEMO)

  useEffect(() => {
    if (INTERACTIVE_DEMO) {
      useAuthStore.setState({ isLoading: false, onboardingComplete: true })
    }
    void loadAuth()
    if (INTERACTIVE_DEMO) void setOnboardingComplete()
  }, [loadAuth, setOnboardingComplete])

  useEffect(() => {
    if (INTERACTIVE_DEMO) return
    void (async () => {
      const cached = await loadCachedStreamItems()
      if (cached.length > 0) {
        setItems(cached)
        setLoading(false)
      }
    })()
  }, [setItems, setLoading])

  useEffect(() => {
    if (!showStream || INTERACTIVE_DEMO) return
    void (async () => {
      try {
        const items = await api.getStream(100)
        setItems(items)
        await cacheStreamItems(items)
        await api.syncAll()
        const fresh = await api.getStream(100)
        setItems(fresh)
        await cacheStreamItems(fresh)
      } catch {
        setLoading(false)
      }
    })()
  }, [showStream, setItems, setLoading])

  if (isAuthLoading && !INTERACTIVE_DEMO) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-stream-bg">
        <p className="font-mono text-sm text-stream-secondary">Starting STREAM…</p>
      </div>
    )
  }

  if (!skipOnboarding && shouldShowOnboarding()) {
    return <Onboarding />
  }

  if (booting) {
    return <DemoSplash />
  }

  return (
    <div className="relative flex min-h-[100dvh] max-w-lg mx-auto w-full flex-col bg-stream-bg">
      <NotificationBannerStack />
      <MeetingContextPanel />
      {INTERACTIVE_DEMO && <DemoLiveBar />}
      <AppHeader />
      <FilterBar />
      <StreamFeed />
      <AIBar />
    </div>
  )
}
