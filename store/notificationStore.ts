import { create } from 'zustand'
import type { StreamItem } from '@shared/types'
import type { MeetingContext } from '@shared/platform-types'

export type BannerAction = {
  label: string
  /** open meeting panel | join zoom | dismiss | route agent */
  type: 'meeting_panel' | 'external' | 'dismiss' | 'agent'
  payload?: string
}

export interface PriorityBanner {
  id: string
  item: StreamItem
  title: string
  subtitle: string
  actions: BannerAction[]
  expiresAt?: number
}

interface NotificationState {
  queue: PriorityBanner[]
  activeMeeting: MeetingContext | null
  sidePanelOpen: boolean

  pushBanner: (banner: PriorityBanner) => void
  dismissBanner: (id: string) => void
  openMeetingPanel: (meeting: MeetingContext) => void
  closeMeetingPanel: () => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  queue: [],
  activeMeeting: null,
  sidePanelOpen: false,

  pushBanner: (banner) => {
    set({ queue: [banner, ...get().queue].slice(0, 5) })
  },

  dismissBanner: (id) => {
    set({ queue: get().queue.filter((b) => b.id !== id) })
  },

  openMeetingPanel: (meeting) => {
    set({ activeMeeting: meeting, sidePanelOpen: true })
  },

  closeMeetingPanel: () => {
    set({ sidePanelOpen: false })
  }
}))
