import type { ConnectorImpl, ConnectorChunk, ConnectorCredentials, ConnectorSettings } from './types'

// Trello — REST API with API key + token (both required)
// Extracts: cards with descriptions, checklists, and comments from specified boards

const BASE = 'https://api.trello.com/1'

async function trelloFetch(path: string, key: string, token: string) {
  const url = `${BASE}${path}${path.includes('?') ? '&' : '?'}key=${key}&token=${token}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Trello API ${res.status}: ${await res.text()}`)
  return res.json()
}

export const trelloConnector: ConnectorImpl = {
  type: 'trello',
  label: 'Trello',
  description: 'Syncs cards, descriptions, checklists, and comments from selected boards',
  authType: 'api_key',

  async validate(creds) {
    try {
      const [key, token] = (creds.apiKey ?? '').split(':')
      if (!key || !token) return { ok: false, error: 'Provide key:token format' }
      await trelloFetch('/members/me', key, token)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  },

  async *fetchChunks(creds, settings, since) {
    const [key, token] = (creds.apiKey ?? '').split(':')
    const boardIds: string[] = settings.boardIds ?? []

    let targets = boardIds
    if (targets.length === 0) {
      const boards = await trelloFetch('/members/me/boards?fields=id,name', key, token) as { id: string; name: string }[]
      targets = boards.map(b => b.id)
    }

    for (const boardId of targets) {
      const cards = await trelloFetch(
        `/boards/${boardId}/cards?fields=id,name,desc,dateLastActivity,url&checklists=all&actions=commentCard`,
        key, token
      ) as Array<{
        id: string; name: string; desc: string
        dateLastActivity: string; url: string
        checklists: Array<{ name: string; checkItems: { name: string; state: string }[] }>
        actions: Array<{ data: { text: string }; memberCreator: { fullName: string } }>
      }>

      for (const card of cards) {
        const updatedMs = new Date(card.dateLastActivity).getTime()
        if (since && updatedMs < since) continue
        if (!card.desc && !card.checklists?.length && !card.actions?.length) continue

        const checklistText = card.checklists?.map(cl =>
          `${cl.name}:\n${cl.checkItems.map(i => `  [${i.state === 'complete' ? 'x' : ' '}] ${i.name}`).join('\n')}`
        ).join('\n') ?? ''

        const commentsText = card.actions
          ?.filter(a => a.data?.text?.length > 20)
          .map(a => `${a.memberCreator.fullName}: ${a.data.text}`)
          .join('\n') ?? ''

        const content = [
          `Card: ${card.name}`,
          card.desc ? `Description: ${card.desc}` : '',
          checklistText ? `Checklists:\n${checklistText}` : '',
          commentsText ? `Comments:\n${commentsText}` : '',
        ].filter(Boolean).join('\n\n')

        if (content.length < 80) continue

        yield {
          content,
          sourceId: `trello-card-${card.id}`,
          sourceUrl: card.url,
          title: card.name,
          timestamp: updatedMs,
          contentType: 'issue',
        } satisfies ConnectorChunk
      }
    }
  },
}
