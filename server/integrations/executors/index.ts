import type { Server as SocketServer } from 'socket.io'
import { registerActionExecutor, type ActionRunInput, type ActionRunResult } from '../registry'
import { createMondayItemOnBoard, isMondayConnected } from '../../sources/monday'
import { runMondayNaturalLanguage } from '../../cluster/mondayExecute'
import {
  isGmailConnected,
  replyToGmailThread,
  sendGmailMessage
} from '../../sources/gmail'
import { isSlackConnected, sendSlackMessage, resolveSlackChannel } from '../../sources/slack'
import { isDiscordConnected, sendDiscordMessage, resolveDiscordChannel } from '../../sources/discord'
import { isXConnected, postXTweet } from '../../sources/x'
import { isPerplexityConnected, askPerplexity } from '../../sources/perplexity'
import type { ComposeCommand } from '../../../shared/compose'
import { parseComposeCommand } from '../../../shared/compose'
import { getRecentItems } from '../../db'

export type ActionRunContext = ActionRunInput & {
  parsed: ComposeCommand
  io?: SocketServer
}

function ok(provider: string, message: string, executed: string[] = [message]): ActionRunResult {
  return { ok: true, provider, message, executed }
}

function fail(provider: string, message: string): ActionRunResult {
  return { ok: false, provider, message, executed: [] }
}

function streamContextItem(contextItemId?: string) {
  if (!contextItemId) return null
  const bare = contextItemId.replace(/^ext-/, '')
  return getRecentItems(500).find((i) => i.id === bare || i.id === contextItemId) ?? null
}

async function runMonday(ctx: ActionRunContext): Promise<ActionRunResult> {
  if (!isMondayConnected()) return fail('monday', 'Monday not connected')

  const { intent, target, body } = ctx.parsed
  if (intent === 'comment' || intent === 'move') {
    if (!target) return fail('monday', 'Use @monday #ITEM_ID comment: … or move to …')
    const cmd =
      intent === 'comment' ? `comment: ${body}` : body.toLowerCase().startsWith('move') ? body : `move to ${body}`
    const result = await runMondayNaturalLanguage(target, cmd)
    return ok('monday', result.message, result.executed)
  }

  const created = await createMondayItemOnBoard({
    name: body,
    boardName: target
  })
  const msg = created.groupTitle
    ? `Created in ${created.boardName} → ${created.groupTitle}: ${body}`
    : `Created on ${created.boardName}: ${body}`
  return ok('monday', msg)
}

async function runGmail(ctx: ActionRunContext): Promise<ActionRunResult> {
  if (!(await isGmailConnected())) {
    return fail('gmail', 'Gmail not connected — open Integrations and connect Gmail first.')
  }

  const { intent, target, body } = ctx.parsed

  try {
    if (intent === 'send') {
      if (!target) {
        return fail(
          'gmail',
          'Use: @gmail send sharmaapoorva124@gmail.com: Subject line / message body'
        )
      }
      const slash = body.indexOf(' / ')
      const subject =
        slash >= 0 ? body.slice(0, slash).trim() : body.split('\n')[0]?.trim() || '(no subject)'
      const messageBody =
        slash >= 0 ? body.slice(slash + 3).trim() : body.split('\n').slice(1).join('\n').trim() || body

      await sendGmailMessage({ to: target, subject, body: messageBody })
      return ok('gmail', `Sent to ${target}`)
    }

    const item =
      streamContextItem(ctx.contextItemId) ?? getRecentItems(80).find((i) => i.source === 'gmail')
    if (!item?.metadata?.threadId) {
      return fail(
        'gmail',
        'No Gmail thread selected — click a Gmail post in the feed, then @gmail reply: your message'
      )
    }

    await replyToGmailThread({
      threadId: String(item.metadata.threadId),
      accountId: String(item.metadata.accountId ?? ''),
      body
    })
    return ok('gmail', 'Reply sent')
  } catch (err) {
    const msg = String(err)
    if (/insufficient|scope|403|Forbidden/i.test(msg)) {
      return fail(
        'gmail',
        'Gmail send permission missing — go to Integrations → Gmail → reconnect to grant send access.'
      )
    }
    return fail('gmail', msg)
  }
}

async function runSlack(ctx: ActionRunContext): Promise<ActionRunResult> {
  if (!isSlackConnected()) return fail('slack', 'Slack not connected')

  const { intent, target, body } = ctx.parsed
  let channel = target
  let threadTs: string | undefined

  if (intent === 'reply') {
    const item = streamContextItem(ctx.contextItemId) ?? getRecentItems(80).find((i) => i.source === 'slack')
    channel = item?.metadata?.channel ? String(item.metadata.channel) : undefined
    threadTs = item?.metadata?.ts ? String(item.metadata.ts) : undefined
    if (!channel) return fail('slack', 'No Slack message context for reply')
  } else if (channel) {
    channel = await resolveSlackChannel(channel)
  } else {
    return fail('slack', 'Use @slack #channel: message')
  }

  const sent = await sendSlackMessage({ channel, text: body, threadTs })
  return ok('slack', threadTs ? `Replied in thread` : `Posted to Slack (${sent.channel})`)
}

async function runDiscord(ctx: ActionRunContext): Promise<ActionRunResult> {
  if (!isDiscordConnected()) return fail('discord', 'Discord not connected')

  const { target, body } = ctx.parsed
  if (!target) return fail('discord', 'Use @discord #channel-name: message')

  const channelId = await resolveDiscordChannel(target)
  await sendDiscordMessage(channelId, body)
  return ok('discord', `Posted to Discord #${target}`)
}

async function runX(ctx: ActionRunContext): Promise<ActionRunResult> {
  if (!isXConnected()) return fail('x', 'X not connected')

  const { intent, body, target } = ctx.parsed
  const tweet = await postXTweet(body, intent === 'reply' ? target : undefined)
  return ok('x', `Posted to X (${tweet.id})`)
}

async function runPerplexity(ctx: ActionRunContext): Promise<ActionRunResult> {
  if (!isPerplexityConnected()) return fail('perplexity', 'Perplexity not connected')

  const item = await askPerplexity(
    ctx.parsed.body,
    'You are a concise research assistant for a revenue team. Answer in 2-4 sentences.',
    ctx.io
  )
  const preview = item.body.slice(0, 120)
  return ok('perplexity', preview.length < item.body.length ? `${preview}…` : preview)
}

export function registerIntegrationExecutors(): void {
  const wrap =
    (provider: ComposeCommand['provider'], fn: (ctx: ActionRunContext) => Promise<ActionRunResult>) =>
    (input: ActionRunInput) => {
      const parsed = parseComposeCommand(input.raw)
      if (!parsed || parsed.provider !== provider) {
        return Promise.resolve(fail(provider, 'Invalid command syntax'))
      }
      return fn({ ...input, parsed, io: input.io })
    }

  registerActionExecutor('monday', wrap('monday', runMonday))
  registerActionExecutor('gmail', wrap('gmail', runGmail))
  registerActionExecutor('slack', wrap('slack', runSlack))
  registerActionExecutor('discord', wrap('discord', runDiscord))
  registerActionExecutor('x', wrap('x', runX))
  registerActionExecutor('perplexity', wrap('perplexity', runPerplexity))
}
