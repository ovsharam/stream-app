import type { StreamItem } from './types'

export function streamItemToJSON(item: StreamItem): string {
  return JSON.stringify({
    ...item,
    timestamp: item.timestamp instanceof Date ? item.timestamp.toISOString() : item.timestamp
  })
}

export function streamItemFromJSON(raw: string): StreamItem {
  const parsed = JSON.parse(raw) as StreamItem & { timestamp: string }
  return {
    ...parsed,
    timestamp: new Date(parsed.timestamp)
  }
}

export function streamItemToApi(item: StreamItem): Record<string, unknown> {
  return {
    ...item,
    timestamp: item.timestamp.toISOString()
  }
}

export function streamItemFromApi(data: Record<string, unknown>): StreamItem {
  return {
    ...(data as unknown as StreamItem),
    timestamp: new Date(data.timestamp as string)
  }
}
