import { create } from 'zustand'
import type { StreamItem, StreamSource } from '@shared/types'

interface StreamState {
  items: StreamItem[]
  newItemCount: number
  arrivedIds: string[]
  latestToast: StreamItem | null
  demoPaused: boolean
  demoSpeed: 1 | 2 | 3
  activeSources: Set<StreamSource | 'all'>
  keywordFilter: string
  expandedId: string | null
  isLoading: boolean

  setItems: (items: StreamItem[]) => void
  prependItems: (items: StreamItem[]) => void
  upsertItem: (item: StreamItem) => void
  pushLiveItem: (item: StreamItem) => void
  updateItem: (item: StreamItem) => void
  setNewItemCount: (n: number) => void
  clearNewItems: () => void
  clearArrivedId: (id: string) => void
  setLatestToast: (item: StreamItem | null) => void
  setDemoPaused: (v: boolean) => void
  setDemoSpeed: (s: 1 | 2 | 3) => void
  toggleSource: (source: StreamSource | 'all') => void
  setKeywordFilter: (q: string) => void
  setExpandedId: (id: string | null) => void
  setLoading: (v: boolean) => void
  getFilteredItems: () => StreamItem[]
  getUnreadCount: () => number
}

function sortItems(items: StreamItem[]): StreamItem[] {
  return [...items].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
}

export const useStreamStore = create<StreamState>((set, get) => ({
  items: [],
  newItemCount: 0,
  arrivedIds: [],
  latestToast: null,
  demoPaused: false,
  demoSpeed: 1,
  activeSources: new Set(['all']),
  keywordFilter: '',
  expandedId: null,
  isLoading: true,

  setItems: (items) => set({ items: sortItems(items), isLoading: false }),

  prependItems: (incoming) => {
    const { items } = get()
    const ids = new Set(items.map((i) => i.id))
    const fresh = incoming.filter((i) => !ids.has(i.id))
    if (fresh.length === 0) return
    set({
      items: sortItems([...fresh, ...items]),
      newItemCount: get().newItemCount + fresh.length
    })
  },

  upsertItem: (item) => {
    const { items } = get()
    const idx = items.findIndex((i) => i.id === item.id)
    if (idx >= 0) {
      const next = [...items]
      next[idx] = item
      set({ items: sortItems(next) })
    } else {
      set({
        items: sortItems([item, ...items]),
        newItemCount: get().newItemCount + 1
      })
    }
  },

  pushLiveItem: (item) => {
    const { items, arrivedIds } = get()
    set({
      items: sortItems([item, ...items]),
      newItemCount: get().newItemCount + 1,
      arrivedIds: [item.id, ...arrivedIds].slice(0, 20),
      latestToast: item
    })
  },

  clearArrivedId: (id) => {
    set({ arrivedIds: get().arrivedIds.filter((x) => x !== id) })
  },

  setLatestToast: (item) => set({ latestToast: item }),

  setDemoPaused: (v) => set({ demoPaused: v }),

  setDemoSpeed: (s) => set({ demoSpeed: s }),

  updateItem: (item) => {
    const { items } = get()
    set({
      items: sortItems(items.map((i) => (i.id === item.id ? item : i)))
    })
  },

  setNewItemCount: (n) => set({ newItemCount: n }),
  clearNewItems: () => set({ newItemCount: 0 }),

  toggleSource: (source) => {
    const { activeSources } = get()
    const next = new Set(activeSources)

    if (source === 'all') {
      set({ activeSources: new Set(['all']) })
      return
    }

    next.delete('all')

    if (next.has(source)) next.delete(source)
    else next.add(source)

    if (next.size === 0) next.add('all')
    set({ activeSources: next })
  },

  setKeywordFilter: (q) => set({ keywordFilter: q }),
  setExpandedId: (id) => set({ expandedId: id }),
  setLoading: (v) => set({ isLoading: v }),

  getFilteredItems: () => {
    const { items, activeSources, keywordFilter } = get()
    let filtered = items

    if (!activeSources.has('all')) {
      filtered = filtered.filter((i) => activeSources.has(i.source))
    }

    if (keywordFilter.trim()) {
      const q = keywordFilter.toLowerCase()
      filtered = filtered.filter(
        (i) =>
          i.body.toLowerCase().includes(q) ||
          i.title?.toLowerCase().includes(q) ||
          i.sender.name.toLowerCase().includes(q)
      )
    }

    return filtered
  },

  getUnreadCount: () => get().items.filter((i) => i.isUnread).length
}))
