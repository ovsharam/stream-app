import type { ConnectorImpl, ConnectorType } from './types'
import { githubConnector } from './github'
import { slackConnector } from './slack'
import { linearConnector } from './linear'
import { notionConnector } from './notion'
import { googleDriveConnector } from './google-drive'
import { jiraConnector } from './jira'
import { gongConnector } from './gong'
import { zoomConnector } from './zoom'
import { mondayConnector } from './monday'
import { trelloConnector } from './trello'
import { asanaConnector } from './asana'
import { clickupConnector } from './clickup'
import { confluenceConnector } from './confluence'
import { gitbookConnector } from './gitbook'
import { readmeConnector } from './readme'
import { salesforceConnector } from './salesforce'
import { gmailConnector } from './gmail'
import { teamsConnector } from './teams'
import { docsSiteConnector } from './docs-site'

const registry = new Map<ConnectorType, ConnectorImpl>([
  ['github',      githubConnector],
  ['slack',       slackConnector],
  ['linear',      linearConnector],
  ['notion',      notionConnector],
  ['google_drive',googleDriveConnector],
  ['jira',        jiraConnector],
  ['gong',        gongConnector],
  ['zoom',        zoomConnector],
  ['monday',      mondayConnector],
  ['trello',      trelloConnector],
  ['asana',       asanaConnector],
  ['clickup',     clickupConnector],
  ['confluence',  confluenceConnector],
  ['gitbook',     gitbookConnector],
  ['readme',      readmeConnector],
  ['salesforce',  salesforceConnector],
  ['gmail',       gmailConnector],
  ['teams',       teamsConnector],
  ['docs_site',   docsSiteConnector],
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
