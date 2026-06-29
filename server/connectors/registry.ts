import type { ConnectorImpl, ConnectorType } from './types'
import { githubConnector } from './github'
import { slackConnector } from './slack'
import { linearConnector } from './linear'
import { notionConnector } from './notion'
import { googleDriveConnector } from './google-drive'
import { jiraConnector } from './jira'
import { gongConnector } from './gong'
import { zoomConnector } from './zoom'

const registry = new Map<ConnectorType, ConnectorImpl>([
  ['github', githubConnector],
  ['slack', slackConnector],
  ['linear', linearConnector],
  ['notion', notionConnector],
  ['google_drive', googleDriveConnector],
  ['jira', jiraConnector],
  ['gong', gongConnector],
  ['zoom', zoomConnector],
])

export function getConnectorImpl(type: ConnectorType): ConnectorImpl {
  const impl = registry.get(type)
  if (!impl) throw new Error(`Unknown connector type: ${type}`)
  return impl
}

export function listConnectorMeta() {
  return Array.from(registry.values()).map(c => ({
    type: c.type,
    label: c.label,
    description: c.description,
    authType: c.authType,
  }))
}
