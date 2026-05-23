/**
 * MCP Connector Registry
 *
 * Each connector wraps an MCP server (Gmail, Slack, X, iMessage bridge, YouTube, etc.)
 * and exposes: listResources, subscribe (push), normalize → StreamItem
 *
 * Phase 2: wire @modelcontextprotocol/sdk clients per connector.
 * Tokens stay server-side (session cookies); MCP runs in backend worker, not browser.
 */

import type { StreamItem } from '../../shared/types'
import type { McpConnectorConfig, PlatformSource } from '../../shared/platform-types'

export type McpIngestResult = {
  items: StreamItem[]
  cursor?: string
}

export interface McpConnector {
  config: McpConnectorConfig
  connect(sessionId: string): Promise<void>
  disconnect(): Promise<void>
  /** Initial backfill */
  sync(sessionId: string, opts?: { limit?: number }): Promise<McpIngestResult>
  /** Real-time: webhook or MCP subscription → items */
  poll?(sessionId: string, since: string): Promise<McpIngestResult>
}

const registry = new Map<string, McpConnector>()

export function registerConnector(connector: McpConnector): void {
  registry.set(connector.config.id, connector)
}

export function getConnector(id: string): McpConnector | undefined {
  return registry.get(id)
}

export function listConnectors(): McpConnectorConfig[] {
  return [...registry.values()].map((c) => c.config)
}

export function connectorsForSource(source: PlatformSource): McpConnector[] {
  return [...registry.values()].filter((c) => c.config.source === source)
}

/** Default FDE connector manifest — implement each in server/mcp/connectors/ */
export const FDE_CONNECTOR_MANIFEST: McpConnectorConfig[] = [
  {
    id: 'mcp-gmail',
    name: 'Gmail',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-gmail'],
    source: 'gmail',
    enabled: false
  },
  {
    id: 'mcp-slack',
    name: 'Slack',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-slack'],
    source: 'slack',
    enabled: false
  },
  {
    id: 'mcp-x',
    name: 'X / Twitter',
    transport: 'http',
    url: process.env.MCP_X_URL,
    source: 'x',
    enabled: false
  },
  {
    id: 'mcp-imessage',
    name: 'iMessage',
    transport: 'stdio',
    command: process.env.MCP_IMESSAGE_CMD,
    source: 'imessage',
    enabled: false
  },
  {
    id: 'mcp-youtube',
    name: 'YouTube',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@anthropic/mcp-server-youtube'],
    source: 'youtube',
    enabled: false
  },
  {
    id: 'mcp-calendar',
    name: 'Google Calendar',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-google-calendar'],
    source: 'calendar',
    enabled: false
  },
  {
    id: 'mcp-zoom',
    name: 'Zoom',
    transport: 'http',
    url: process.env.MCP_ZOOM_URL,
    source: 'zoom',
    enabled: false
  },
  {
    id: 'mcp-gong',
    name: 'Gong',
    transport: 'http',
    url: process.env.MCP_GONG_URL,
    source: 'gong',
    enabled: false
  }
]

export async function syncAllConnectors(sessionId: string): Promise<StreamItem[]> {
  const all: StreamItem[] = []
  for (const connector of registry.values()) {
    if (!connector.config.enabled) continue
    try {
      await connector.connect(sessionId)
      const { items } = await connector.sync(sessionId)
      all.push(...items)
    } catch (err) {
      console.error(`[mcp] ${connector.config.id} sync failed:`, err)
    }
  }
  return all
}
