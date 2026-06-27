/** Case workspace — tabs and lifecycle copy for the FDE deployment OS. */

export type CaseWorkspaceTab =
  | 'overview'
  | 'requirements'
  | 'channels'
  | 'meetings'
  | 'build'
  | 'activity'

export const CASE_WORKSPACE_TABS: {
  id: CaseWorkspaceTab
  label: string
  hint: string
}[] = [
  { id: 'overview', label: 'Overview', hint: 'Scope, stage, handoff' },
  { id: 'requirements', label: 'Requirements', hint: 'Extracted & reviewed' },
  { id: 'channels', label: 'Channels', hint: 'Email, Slack, LinkedIn' },
  { id: 'meetings', label: 'Meetings', hint: 'Calls & transcripts' },
  { id: 'build', label: 'Build', hint: 'Agents & delivery' },
  { id: 'activity', label: 'Activity', hint: 'Decision telemetry' }
]

export const FDE_PRODUCT_THESIS =
  'Custom software, sales, and product in one workspace — not support tickets. Meetings become requirements; context score gates build; agents execute after human review.'
