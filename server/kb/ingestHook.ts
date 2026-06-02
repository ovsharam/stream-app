import type { StreamItem } from '../../shared/types'

/** Lazy hook so db layer can auto-graph feed items without circular import issues at load. */
export function autoIngestStreamItem(item: StreamItem): void {
  try {
    const { ingestStreamItem } = require('./pipeline') as typeof import('./pipeline')
    ingestStreamItem(item)
  } catch (e) {
    console.warn('[kb] auto-ingest failed:', e instanceof Error ? e.message : e)
  }
}
