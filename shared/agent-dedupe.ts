/** Stable keys for LinkedIn agent proposal deduplication (server + Notch poll). */

export function normalizeLinkedInSenderForDedupe(name: string): string {
  return name.replace(/\s+Status is offline[\s\S]*$/i, '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function normalizeMessageForDedupe(message: string): string {
  return message.replace(/\s+/g, ' ').trim().slice(0, 120)
}

export function canonicalLinkedInThreadKey(threadId: string, senderName: string): string {
  const tid = threadId.trim()
  if (!tid || tid.startsWith('li-list-')) {
    return `sender:${normalizeLinkedInSenderForDedupe(senderName)}`
  }
  return `thread:${tid}`
}

export function proposalDedupeKey(input: {
  threadId: string
  senderName: string
  rawMessage: string
}): string {
  const msg = normalizeMessageForDedupe(input.rawMessage)
  const thread = canonicalLinkedInThreadKey(input.threadId, input.senderName)
  return `linkedin:${thread}:${msg}`
}

export function linkedInIngestSeenKey(input: {
  threadId: string
  senderName: string
  message: string
}): string {
  return proposalDedupeKey({
    threadId: input.threadId,
    senderName: input.senderName,
    rawMessage: input.message
  })
}
