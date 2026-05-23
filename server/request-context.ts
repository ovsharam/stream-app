import { AsyncLocalStorage } from 'async_hooks'

export type RequestContext = {
  sessionId: string
}

export const requestContext = new AsyncLocalStorage<RequestContext>()

export function getSessionIdFromContext(): string {
  const ctx = requestContext.getStore()
  if (!ctx?.sessionId) throw new Error('No session context')
  return ctx.sessionId
}

export function runWithSession<T>(sessionId: string, fn: () => T): T {
  return requestContext.run({ sessionId }, fn)
}
