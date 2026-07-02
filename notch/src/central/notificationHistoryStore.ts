import { useSyncExternalStore } from 'react'

export type NotificationKind = 'meeting' | 'agent' | 'info'

export type NotificationAction = {
  label: string
  onClick: () => void
  primary?: boolean
}

export type StoredNotification = {
  id: string
  kind: NotificationKind
  title: string
  subtitle: string
  timestamp: number
  read: boolean
}

export type Notification = StoredNotification & {
  actions?: NotificationAction[]
}

const STORAGE_KEY = 'notch.notifications.v1'
const MAX_HISTORY = 50

const listeners = new Set<() => void>()
const runtimeActions = new Map<string, NotificationAction[]>()

let notifications: StoredNotification[] = loadFromStorage()

function loadFromStorage(): StoredNotification[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as StoredNotification[]
  } catch {
    return []
  }
}

function persist(ns: StoredNotification[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ns))
  } catch {
    /* ignore */
  }
}

function emit(): void {
  listeners.forEach((l) => l())
}

function getSnapshot(): StoredNotification[] {
  return notifications
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function pushNotification(
  input: Omit<StoredNotification, 'id' | 'timestamp' | 'read'> & { id?: string },
  actions?: NotificationAction[]
): string {
  const id = input.id ?? `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  if (notifications.some((n) => n.id === id)) {
    if (actions) runtimeActions.set(id, actions)
    return id
  }

  const entry: StoredNotification = {
    id,
    kind: input.kind,
    title: input.title,
    subtitle: input.subtitle,
    timestamp: Date.now(),
    read: false,
  }

  if (actions) runtimeActions.set(id, actions)
  notifications = [entry, ...notifications].slice(0, MAX_HISTORY)
  persist(notifications)
  emit()
  return id
}

export function dismissNotification(id: string): void {
  runtimeActions.delete(id)
  const next = notifications.filter((n) => n.id !== id)
  if (next.length === notifications.length) return
  notifications = next
  persist(notifications)
  emit()
}

export function clearAllNotifications(): void {
  runtimeActions.clear()
  notifications = []
  persist(notifications)
  emit()
}

export function markAllRead(): void {
  if (notifications.every((n) => n.read)) return
  notifications = notifications.map((n) => (n.read ? n : { ...n, read: true }))
  persist(notifications)
  emit()
}

export function useNotifications(): Notification[] {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return stored.map((n) => ({ ...n, actions: runtimeActions.get(n.id) }))
}

export function useUnreadCount(): number {
  const stored = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return stored.filter((n) => !n.read).length
}
