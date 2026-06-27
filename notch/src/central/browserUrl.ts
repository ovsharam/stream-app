import { inferWorkspaceMeta } from '../lib/api'
import { tabFromUrl, workspaceTabId, type WorkspaceTab } from './workspace'

export function normalizeBrowserUrl(input: string): string {
  const raw = input.trim()
  if (!raw) return 'https://www.google.com'
  if (/^https?:\/\//i.test(raw)) return raw
  if (/^[a-z0-9.-]+\.[a-z]{2,}(\/|$)/i.test(raw) || raw.includes('.')) return `https://${raw.replace(/^\/\//, '')}`
  return `https://www.google.com/search?q=${encodeURIComponent(raw)}`
}

export function workspaceTabFromInput(input: string, opts?: { id?: string; unique?: boolean }): WorkspaceTab {
  const url = normalizeBrowserUrl(input)
  const meta = inferWorkspaceMeta(url)
  const baseId = workspaceTabId(url)
  const id = opts?.id ?? (opts?.unique ? `${baseId}-${Date.now()}` : baseId)
  return tabFromUrl(url, {
    id,
    title: meta.title,
    source: meta.source,
    tabKind: 'temp'
  })
}

export const BROWSER_QUICK_LINKS = [
  { label: 'Gmail', url: 'https://mail.google.com' },
  { label: 'Google Docs', url: 'https://docs.google.com/document/u/0/' },
  { label: 'LinkedIn', url: 'https://www.linkedin.com/feed/' },
  { label: 'Monday', url: 'https://monday.com' }
] as const
