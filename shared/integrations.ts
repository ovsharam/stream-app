/**
 * Integration catalog — ingest + execute capabilities.
 */

export type IntegrationAuth = 'oauth' | 'api_token' | 'webhook' | 'mcp' | 'native'

export type IntegrationCapability = 'ingest' | 'execute' | 'draft_llm' | 'calendar' | 'voice'

export type IntegrationActionKind =
  | 'create_record'
  | 'update_field'
  | 'comment'
  | 'send_message'
  | 'trigger_webhook'
  | 'draft_reply'
  | 'schedule'
  | 'join_meeting'

export type IntegrationStatus = 'live' | 'beta' | 'planned'

export interface IntegrationDef {
  id: string
  name: string
  tagline: string
  status: IntegrationStatus
  auth: IntegrationAuth
  capabilities: IntegrationCapability[]
  composePrefix?: string
  actions: IntegrationActionKind[]
  feedSources: string[]
}

export const INTEGRATION_CATALOG: IntegrationDef[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    tagline: 'Inbox stream, send & reply',
    status: 'live',
    auth: 'oauth',
    capabilities: ['ingest', 'execute', 'calendar', 'draft_llm'],
    composePrefix: 'gmail',
    actions: ['draft_reply', 'send_message'],
    feedSources: ['gmail']
  },
  {
    id: 'monday',
    name: 'Monday.com',
    tagline: 'Board updates, create & move tasks',
    status: 'live',
    auth: 'api_token',
    capabilities: ['ingest', 'execute'],
    composePrefix: 'monday',
    actions: ['create_record', 'comment', 'update_field'],
    feedSources: ['monday']
  },
  {
    id: 'slack',
    name: 'Slack',
    tagline: 'Channels, threads, post from feed',
    status: 'live',
    auth: 'oauth',
    capabilities: ['ingest', 'execute'],
    composePrefix: 'slack',
    actions: ['send_message', 'comment'],
    feedSources: ['slack']
  },
  {
    id: 'discord',
    name: 'Discord',
    tagline: 'Channel messages in & out',
    status: 'live',
    auth: 'api_token',
    capabilities: ['ingest', 'execute'],
    composePrefix: 'discord',
    actions: ['send_message'],
    feedSources: ['discord']
  },
  {
    id: 'x',
    name: 'X',
    tagline: 'Timeline ingest, post tweets',
    status: 'live',
    auth: 'api_token',
    capabilities: ['ingest', 'execute'],
    composePrefix: 'x',
    actions: ['send_message'],
    feedSources: ['x']
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    tagline: 'Research from the feed',
    status: 'live',
    auth: 'api_token',
    capabilities: ['ingest', 'execute'],
    composePrefix: 'perplexity',
    actions: ['trigger_webhook'],
    feedSources: ['perplexity']
  },
  {
    id: 'linear',
    name: 'Linear',
    tagline: 'Issues, cycles, project updates',
    status: 'planned',
    auth: 'oauth',
    capabilities: ['ingest', 'execute'],
    composePrefix: 'linear',
    actions: ['create_record', 'comment', 'update_field'],
    feedSources: ['linear']
  }
]

export function integrationById(id: string): IntegrationDef | undefined {
  return INTEGRATION_CATALOG.find((i) => i.id === id)
}

export { parseComposeCommand, isComposeAction, COMPOSE_HELP } from './compose'
