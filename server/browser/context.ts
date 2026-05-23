/**
 * Browser context from Chrome extension — scopes graph search
 * without storing full page HTML (privacy-first).
 */

export type BrowserContextPayload = {
  url: string
  hostname: string
  title: string
  /** Salesforce opp id, Gmail thread id, etc. */
  entityHint?: string
  entityType?: 'salesforce' | 'gmail' | 'linkedin' | 'zoom' | 'generic'
  selectedText?: string
  timestamp: string
}

let latest: BrowserContextPayload | null = null

export function setBrowserContext(ctx: BrowserContextPayload): void {
  latest = ctx
}

export function getBrowserContext(): BrowserContextPayload | null {
  return latest
}

export function browserScopeChips(): string[] {
  if (!latest) return []
  const chips: string[] = []
  if (latest.entityType === 'salesforce') chips.push('Salesforce context')
  if (latest.entityType === 'gmail') chips.push('Gmail thread')
  if (latest.selectedText) chips.push(latest.selectedText.slice(0, 40))
  if (latest.hostname.includes('linkedin')) chips.push('LinkedIn')
  return chips
}

export function inferEntityType(url: string): BrowserContextPayload['entityType'] {
  if (url.includes('lightning.force.com') || url.includes('salesforce.com')) return 'salesforce'
  if (url.includes('mail.google.com')) return 'gmail'
  if (url.includes('linkedin.com')) return 'linkedin'
  if (url.includes('zoom.us')) return 'zoom'
  return 'generic'
}

export function inferEntityHint(url: string): string | undefined {
  const sf = url.match(/\/Opportunity\/([a-zA-Z0-9]+)/)
  if (sf) return sf[1]
  const gmail = url.match(/[#/]([a-f0-9]{16})$/i)
  if (gmail) return gmail[1]
  return undefined
}
