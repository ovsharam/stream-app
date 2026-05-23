import type { McpConnector, McpIngestResult } from '../registry'
import type { McpConnectorConfig } from '../../../shared/platform-types'

/** Placeholder until real MCP SDK client is wired */
export function createStubConnector(config: McpConnectorConfig): McpConnector {
  return {
    config,
    async connect() {},
    async disconnect() {},
    async sync(): Promise<McpIngestResult> {
      return { items: [] }
    }
  }
}
