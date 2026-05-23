import type { StreamItem } from '@shared/types'

export function buildStreamContextPrompt(items: StreamItem[]): string {
  const last10 = items.slice(0, 10)
  const contextLines = last10
    .map((i) => `[${i.source}] ${i.sender.name}: ${i.body}`)
    .join('\n')

  return `You are an assistant reading the same information stream as the user.
Here are the last 10 items in their stream:
${contextLines}

Answer the user's question with awareness of this context.
Be direct. One or two paragraphs max unless detail is explicitly requested.`
}

export function buildQuerySystemPrompt(items: StreamItem[]): string {
  return buildStreamContextPrompt(items)
}
