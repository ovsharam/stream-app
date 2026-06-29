import { NextResponse } from 'next/server'

const CONNECTOR_META = [
  { type: 'slack',        label: 'Slack',         description: 'Sync channel history and threads to capture product discussions, decisions, and customer signals.', authType: 'oauth' },
  { type: 'github',       label: 'GitHub',        description: 'Sync releases, PRs, issues, and changelog to track what shipped and what changed.', authType: 'pat' },
  { type: 'linear',       label: 'Linear',        description: 'Sync issues and comments to understand feature backlog, bugs, and team priorities.', authType: 'api_key' },
  { type: 'notion',       label: 'Notion',        description: 'Sync pages and databases to capture product specs, runbooks, and internal docs.', authType: 'oauth' },
  { type: 'google_drive', label: 'Google Drive',  description: 'Sync Docs, Sheets, and Slides to keep product docs and decks in the graph.', authType: 'oauth' },
  { type: 'jira',         label: 'Jira',          description: 'Sync tickets and comments to track epics, bugs, and project status.', authType: 'api_key' },
  { type: 'gong',         label: 'Gong',          description: 'Sync call transcripts to capture customer feedback and competitive signals from sales calls.', authType: 'oauth' },
  { type: 'zoom',         label: 'Zoom',          description: 'Sync meeting transcripts to capture decisions, action items, and discussion context.', authType: 'oauth' },
  { type: 'monday',       label: 'Monday.com',    description: 'Sync board items and updates to track project progress and delivery timelines.', authType: 'api_key' },
  { type: 'trello',       label: 'Trello',        description: 'Sync cards, checklists, and comments from your product boards.', authType: 'api_key' },
  { type: 'asana',        label: 'Asana',         description: 'Sync tasks and stories to capture sprint work, blockers, and delivery notes.', authType: 'pat' },
  { type: 'clickup',      label: 'ClickUp',       description: 'Sync tasks and comments across spaces and lists to track all ongoing work.', authType: 'api_key' },
  { type: 'confluence',   label: 'Confluence',    description: 'Sync pages from Confluence spaces for product specs, RFCs, and runbooks.', authType: 'api_key' },
  { type: 'gitbook',      label: 'GitBook',       description: 'Sync documentation pages to keep user-facing docs reflected in the product graph.', authType: 'api_key' },
  { type: 'readme',       label: 'Readme.com',    description: 'Sync product docs, API reference, and changelog entries from Readme.', authType: 'api_key' },
] as const

export async function GET() {
  return NextResponse.json({ connectors: CONNECTOR_META })
}
