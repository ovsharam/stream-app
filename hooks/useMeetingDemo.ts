'use client'

import { useEffect, useRef } from 'react'
import { useStreamStore } from '@/store/streamStore'
import { useNotificationStore } from '@/store/notificationStore'
import { createDemoMeetingContext } from '@/lib/demo-meeting'
import { INTERACTIVE_DEMO } from '@/hooks/useInteractiveDemo'
import { v4 as uuidv4 } from 'uuid'

/** Fires iOS-style meeting banner after delay in interactive demo */
export function useMeetingDemo(active: boolean): void {
  const fired = useRef(false)
  const items = useStreamStore((s) => s.items)
  const pushBanner = useNotificationStore((s) => s.pushBanner)
  const openMeetingPanel = useNotificationStore((s) => s.openMeetingPanel)

  useEffect(() => {
    if (!active || !INTERACTIVE_DEMO || fired.current || items.length < 2) return

    const timer = setTimeout(() => {
      fired.current = true
      const meeting = createDemoMeetingContext(items)
      useNotificationStore.setState({ activeMeeting: meeting })

      const calendarItem = {
        id: `demo-live-${uuidv4()}`,
        source: 'note' as const,
        sender: { name: 'Calendar', handle: 'calendar' },
        timestamp: new Date(),
        title: meeting.title,
        body: 'Meeting starts now — prep panel ready on laptop.',
        isUnread: true,
        isStarred: false,
        metadata: {
          kind: 'meeting',
          priority: 'urgent',
          meetingId: meeting.id
        }
      }

      useStreamStore.getState().pushLiveItem(calendarItem)

      pushBanner({
        id: `banner-${meeting.id}`,
        item: calendarItem,
        title: 'Calendar',
        subtitle: `${meeting.title} — starting now`,
        actions: [
          { label: 'Open prep', type: 'meeting_panel' },
          {
            label: 'Join Zoom',
            type: 'external',
            payload: meeting.zoomJoinUrl
          }
        ],
        expiresAt: Date.now() + 30_000
      })
    }, 22_000)

    return () => clearTimeout(timer)
  }, [active, items.length, pushBanner, openMeetingPanel])
}
