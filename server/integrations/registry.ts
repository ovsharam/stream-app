export type ActionRunInput = {
  provider: string
  command: string
  raw: string
  contextItemId?: string
  sessionId: string
  io?: import('socket.io').Server
}

export type ActionRunResult = {
  ok: boolean
  message: string
  executed: string[]
  provider: string
}

export type ActionExecutor = (input: ActionRunInput) => Promise<ActionRunResult>

const executors = new Map<string, ActionExecutor>()

export function registerActionExecutor(provider: string, fn: ActionExecutor): void {
  executors.set(provider, fn)
}

export async function runIntegrationAction(input: ActionRunInput): Promise<ActionRunResult> {
  const exec = executors.get(input.provider)
  if (!exec) throw new Error(`@${input.provider} actions are not wired yet`)

  return exec(input)
}
