'use client'

import { useEffect, useRef, useState } from 'react'
import { useStreamStore } from '@/store/streamStore'
import { DEMO_INITIAL_ITEMS, nextDemoItem } from '@/lib/demo-scenarios'
import { playIncomingChime } from '@/lib/demo-sounds'

export const INTERACTIVE_DEMO =
  process.env.NEXT_PUBLIC_INTERACTIVE_DEMO === '1' ||
  process.env.NEXT_PUBLIC_DEMO_MODE === '1'

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

export function useInteractiveDemo(active: boolean): {
  isLive: boolean
  booting: boolean
} {
  const [booting, setBooting] = useState(INTERACTIVE_DEMO)
  const [booted, setBooted] = useState(false)
  const pushLiveItem = useStreamStore((s) => s.pushLiveItem)
  const setItems = useStreamStore((s) => s.setItems)
  const setLoading = useStreamStore((s) => s.setLoading)
  const demoPaused = useStreamStore((s) => s.demoPaused)
  const demoSpeed = useStreamStore((s) => s.demoSpeed)
  const items = useStreamStore((s) => s.items)

  useEffect(() => {
    if (!active || !INTERACTIVE_DEMO) {
      setBooting(false)
      return
    }

    setBooting(true)
    const bootTimer = window.setTimeout(() => {
      setItems(DEMO_INITIAL_ITEMS)
      setLoading(false)
      setBooted(true)
      setBooting(false)
    }, 1800)

    return () => clearTimeout(bootTimer)
  }, [active, setItems, setLoading])

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!active || !INTERACTIVE_DEMO || !booted || demoPaused) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    const baseMs = 4000 / demoSpeed

    const tick = () => {
      const item = nextDemoItem()
      pushLiveItem(item)
      playIncomingChime()
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(12)
      }
      const delay = randomBetween(baseMs * 0.65, baseMs * 1.35)
      timerRef.current = setTimeout(tick, delay)
    }

    timerRef.current = setTimeout(tick, randomBetween(1200, 2200) / demoSpeed)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [active, booted, demoPaused, demoSpeed, pushLiveItem])

  useEffect(() => {
    if (!active || !INTERACTIVE_DEMO) return
    const unread = items.filter((i) => i.isUnread).length
    const base = 'STREAM'
    document.title = unread > 0 ? `(${unread}) ${base}` : base
    return () => {
      document.title = base
    }
  }, [active, items])

  return {
    isLive: INTERACTIVE_DEMO && active && booted && !demoPaused,
    booting: INTERACTIVE_DEMO && active && booting
  }
}
