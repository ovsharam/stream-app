import type { FlowEmail } from '@shared/fde-flow'

export const flowEmailStorageKey = (engagementId: string) => `fde-flow-email:${engagementId}`

export function storeFlowEmail(engagementId: string, email: FlowEmail): void {
  try {
    sessionStorage.setItem(flowEmailStorageKey(engagementId), JSON.stringify(email))
  } catch {
    /* ignore quota */
  }
}

export function readFlowEmail(engagementId: string): FlowEmail | null {
  try {
    const raw = sessionStorage.getItem(flowEmailStorageKey(engagementId))
    return raw ? (JSON.parse(raw) as FlowEmail) : null
  } catch {
    return null
  }
}
