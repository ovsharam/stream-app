/**
 * FDE Platform — extended types beyond Phase 1 StreamItem.
 * All connectors normalize to StreamItem; platform metadata carries routing + urgency.
 */

import type { StreamItem, StreamSource } from './types'

/** Sources Phase 2+ — MCP-backed connectors */
export type PlatformSource =
  | StreamSource
  | 'imessage'
  | 'youtube'
  | 'calendar'
  | 'zoom'
  | 'gong'
  | 'claude'
  | 'agent'

export type SignalPriority = 'low' | 'normal' | 'high' | 'urgent'

export type SignalKind =
  | 'message'
  | 'email'
  | 'social'
  | 'meeting'
  | 'call'
  | 'agent_task'
  | 'workflow'
  | 'insight'

/** Attached to StreamItem.metadata for platform routing */
export interface PlatformMetadata {
  kind: SignalKind
  priority: SignalPriority
  /** MCP server that ingested this item */
  mcpServer?: string
  /** Thread/conversation id for reply routing */
  conversationId?: string
  /** Meeting this signal relates to */
  meetingId?: string
  /** Agent or workflow to dispatch on action */
  routeTo?: {
    type: 'agent' | 'workflow' | 'deep_link'
    id: string
    label?: string
  }
  /** Enterprise tool deep link (Zoom join, Gong recap, etc.) */
  externalUrl?: string
  /** Raw MCP tool result — never rendered, kept for agents */
  mcpRaw?: Record<string, unknown>
}

export interface MeetingContext {
  id: string
  title: string
  startsAt: Date
  endsAt?: Date
  attendees: string[]
  zoomJoinUrl?: string
  /** Prepped by agents before call */
  prep: {
    goals: string[]
    openEmails: StreamItem[]
    openSlackThreads: StreamItem[]
    recentBuilds: { name: string; status: string; url?: string }[]
    gongHighlights?: string[]
    claudeBrief?: string
  }
}

export interface McpConnectorConfig {
  id: string
  name: string
  /** MCP server command or hosted URL */
  transport: 'stdio' | 'sse' | 'http'
  command?: string
  args?: string[]
  url?: string
  /** Maps MCP resources/tools to StreamSource */
  source: PlatformSource
  enabled: boolean
}

export interface AgentRoute {
  id: string
  name: string
  description: string
  /** gmail | slack | workflow | gong | claude */
  handles: PlatformSource[]
  endpoint?: string
}

export function getPlatformMeta(item: StreamItem): PlatformMetadata {
  const m = item.metadata as Partial<PlatformMetadata>
  return {
    kind: m.kind ?? defaultKind(item.source),
    priority: m.priority ?? 'normal',
    mcpServer: m.mcpServer,
    conversationId: m.conversationId,
    meetingId: m.meetingId,
    routeTo: m.routeTo,
    externalUrl: m.externalUrl,
    mcpRaw: m.mcpRaw
  }
}

function defaultKind(source: StreamSource): SignalKind {
  switch (source) {
    case 'gmail':
      return 'email'
    case 'slack':
    case 'note':
      return 'message'
    case 'x':
      return 'social'
    case 'perplexity':
      return 'insight'
    default:
      return 'message'
  }
}
