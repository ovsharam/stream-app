import type { CursorBuildStatus, CursorLocalProject } from './cursor-build'

export type BuildExecutor = 'claude-code' | 'cursor-local' | 'cursor-cloud'

export type ClaudeCodeBuildStatus = {
  ready: boolean
  cliPath?: string
  accountLabel?: string
}

export type BuildAgentsStatus = {
  claudeCode: ClaudeCodeBuildStatus
  cursor: CursorBuildStatus
  /** Shared local project list (used by Claude Code + Cursor local). */
  localProjects: CursorLocalProject[]
  activeLocalProjectId?: string
}

export type BuildRunResult = {
  ok: boolean
  message: string
  itemId?: string
  executor: BuildExecutor
}
