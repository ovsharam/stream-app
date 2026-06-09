import { useSyncExternalStore } from 'react'

export type AppToastKind = 'meeting' | 'agent' | 'info'

export type AppToastAction = { label: string; onClick: () => void; primary?: boolean }

export type AppToast = {
  id: string
  kind: AppToastKind
  title: string
  subtitle: string
  urgency?: 'high' | 'normal'
  expiresAt?: number
  dedupeKey?: string
  actions?: AppToastAction[]
}

const MAX_TOASTS = 4
const listeners = new Set<() => void>()
const expiryTimers = new Map<string, ReturnType<typeof setTimeout>>()

let queue: AppToast[] = []

function emit() {
  listeners.forEach((l) => l())
}

function scheduleExpiry(toast: AppToast) {
  if (!toast.expiresAt) return
  const delay = toast.expiresAt - Date.now()
  if (delay <= 0) {
    dismissAppToast(toast.id)
    return
  }
  const existing = expiryTimers.get(toast.id)
  if (existing) clearTimeout(existing)
  expiryTimers.set(
    toast.id,
    setTimeout(() => {
      expiryTimers.delete(toast.id)
      dismissAppToast(toast.id)
    }, delay)
  )
}

export function pushAppToast(input: Omit<AppToast, 'id'> & { id?: string }): string {
  if (input.dedupeKey && queue.some((t) => t.dedupeKey === input.dedupeKey)) {
    return queue.find((t) => t.dedupeKey === input.dedupeKey)!.id
  }

  const id = input.id ?? `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const toast: AppToast = { ...input, id }
  queue = [toast, ...queue].slice(0, MAX_TOASTS)
  scheduleExpiry(toast)
  emit()
  return id
}

export function dismissAppToast(id: string): void {
  const timer = expiryTimers.get(id)
  if (timer) {
    clearTimeout(timer)
    expiryTimers.delete(id)
  }
  const next = queue.filter((t) => t.id !== id)
  if (next.length === queue.length) return
  queue = next
  emit()
}

function getSnapshot(): AppToast[] {
  return queue
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppToastQueue(): AppToast[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
