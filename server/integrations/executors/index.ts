import type { Server as SocketServer } from 'socket.io'
import { registerActionExecutor, type ActionRunInput, type ActionRunResult } from '../registry'
import { createMondayFromNaturalLanguage } from '../../cluster/mondayNlpCreate'
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
import { isClaudeConnected, askClaude } from '../../sources/claude'
import { parseAnthropicError } from '../../sources/claudeOAuthRequest'
import { isGeminiConnected, askGemini } from '../../sources/gemini'
import { isCursorConnected, askCursor } from '../../sources/cursor'
import {
  isGithubConnected,
  createGithubIssue,
  commentGithubIssue,
  syncGithub
} from '../../sources/github'
import { isGdocsConnected, createGoogleDoc, appendGoogleDoc, syncGdocs } from '../../sources/gdocs'
import { isGongConnected, addGongCallNote, syncGong } from '../../sources/gong'
import {
  createCalcomBooking,
  isCalcomConnected,
  parseCalcomBookBody,
  syncCalcom
} from '../../sources/calcom'
import { runMind } from '../../kb/mindExecutor'
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

/** Resolve a feed/context id to a Monday pulse id. */
function resolveMondayItemId(contextItemId?: string): string | null {
  if (!contextItemId) return null
  const bare = contextItemId.replace(/^ext-/, '')
  if (/^\d+$/.test(bare)) return bare

  const item = streamContextItem(contextItemId)
  if (item?.source === 'monday' && item.metadata?.itemId) {
    return String(item.metadata.itemId)
  }
  return null
}

function mondayExplicitNewItem(raw: string, intent: string): boolean {
  if (intent !== 'create') return false
  return /\b(?:create|new\s+item|new\s+task)\s*:/i.test(raw) || /^\/[^:\n]+\s*:/.test(raw.replace(/^@?monday\b\s*:?\s*/i, ''))
}

async function runMonday(ctx: ActionRunContext): Promise<ActionRunResult> {
  if (!isMondayConnected()) return fail('monday', 'Monday not connected')

  const { intent, target, body, raw } = ctx.parsed
  const contextItemId = resolveMondayItemId(ctx.contextItemId)

  if (intent === 'comment' || intent === 'move') {
    const itemId = target ?? contextItemId
    if (!itemId) {
      return fail(
        'monday',
        'Select a Monday item in the feed, or use @monday #ITEM_ID comment: … / move to Done'
      )
    }
    const cmd =
      intent === 'comment' ? `comment: ${body}` : body.toLowerCase().startsWith('move') ? body : `move to ${body}`
    const result = await runMondayNaturalLanguage(itemId, cmd)
    return ok('monday', result.message, result.executed)
  }

  // Explicit board path: @monday /Board Name: task title
  if (target && intent === 'create') {
    const created = await createMondayItemOnBoard({ name: body, boardName: target })
    const msg = created.groupTitle
      ? `Created in ${created.boardName} → ${created.groupTitle}: ${body}`
      : `Created on ${created.boardName}: ${body}`
    return ok('monday', msg)
  }

  if (mondayExplicitNewItem(raw, intent) || !contextItemId) {
    const nlp = await createMondayFromNaturalLanguage(body.replace(/^:\s*/, ''))
    if (!nlp.ok) return fail('monday', nlp.message)
    return ok('monday', nlp.message)
  }

  const result = await runMondayNaturalLanguage(contextItemId, body)
  return ok('monday', result.message, result.executed)
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

const REVENUE_PROMPT =
  'You are a concise GTM copilot for an AE/FDE team. Be direct, actionable, and brief.'

async function runClaude(ctx: ActionRunContext): Promise<ActionRunResult> {
  if (!isClaudeConnected()) return fail('claude', 'Claude not connected — add API key in Integrations')
  try {
    const item = await askClaude(ctx.parsed.body, REVENUE_PROMPT, ctx.io)
    return ok('claude', item.body.slice(0, 140))
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    const message = raw.trimStart().startsWith('{') ? parseAnthropicError(raw) : raw
    return fail('claude', message)
  }
}

async function runGemini(ctx: ActionRunContext): Promise<ActionRunResult> {
  if (!isGeminiConnected()) return fail('gemini', 'Gemini not connected — add API key in Integrations')
  const item = await askGemini(ctx.parsed.body, REVENUE_PROMPT, ctx.io)
  return ok('gemini', item.body.slice(0, 140))
}

async function runCursor(ctx: ActionRunContext): Promise<ActionRunResult> {
  if (!isCursorConnected()) return fail('cursor', 'Cursor not connected — add API key in Integrations')
  const item = await askCursor(ctx.parsed.body, REVENUE_PROMPT, ctx.io)
  return ok('cursor', item.body.slice(0, 140))
}

async function runGithub(ctx: ActionRunContext): Promise<ActionRunResult> {
  if (!isGithubConnected()) return fail('github', 'GitHub not connected')

  const { intent, target, body } = ctx.parsed

  if (intent === 'comment') {
    const item =
      streamContextItem(ctx.contextItemId) ?? getRecentItems(80).find((i) => i.source === 'github')
    const repo = String(item?.metadata?.repo ?? '')
    const number = Number(target ?? item?.metadata?.issueNumber)
    if (!repo || !Number.isFinite(number)) {
      return fail('github', 'Use @github #123 comment: text or select a GitHub issue in feed')
    }
    await commentGithubIssue({ repo, number, body })
    await syncGithub(ctx.io)
    return ok('github', `Commented on ${repo}#${number}`)
  }

  const repo = target?.includes('/') ? target : undefined
  const slash = body.indexOf(' / ')
  const title = slash >= 0 ? body.slice(0, slash).trim() : body.split('\n')[0]?.trim() || body
  const issueBody =
    slash >= 0 ? body.slice(slash + 3).trim() : body.split('\n').slice(1).join('\n').trim()

  const created = await createGithubIssue({
    repo,
    title,
    body: issueBody || title
  })
  await syncGithub(ctx.io)
  return ok('github', `Created issue #${created.number}`)
}

async function runGdocs(ctx: ActionRunContext): Promise<ActionRunResult> {
  if (!(await isGdocsConnected())) {
    return fail('gdocs', 'Google Docs needs Gmail connected — reconnect Gmail for Docs scope')
  }

  const { intent, target, body } = ctx.parsed

  if (intent === 'append') {
    const item =
      streamContextItem(ctx.contextItemId) ?? getRecentItems(80).find((i) => i.source === 'gdocs')
    const docId = String(target ?? item?.metadata?.documentId ?? '')
    if (!docId) return fail('gdocs', 'Use @gdocs #DOC_ID append: text')
    await appendGoogleDoc({ documentId: docId, text: body })
    await syncGdocs(ctx.io)
    return ok('gdocs', 'Appended to Google Doc')
  }

  const slash = body.indexOf(' / ')
  const title = slash >= 0 ? body.slice(0, slash).trim() : body.split('\n')[0]?.trim() || 'Untitled'
  const docBody =
    slash >= 0 ? body.slice(slash + 3).trim() : body.split('\n').slice(1).join('\n').trim()

  const created = await createGoogleDoc({ title, body: docBody })
  await syncGdocs(ctx.io)
  return ok('gdocs', `Created doc: ${title}`)
}

async function runGong(ctx: ActionRunContext): Promise<ActionRunResult> {
  if (!isGongConnected()) return fail('gong', 'Gong not connected')

  const item =
    streamContextItem(ctx.contextItemId) ?? getRecentItems(80).find((i) => i.source === 'gong')
  const callId = String(ctx.parsed.target ?? item?.metadata?.callId ?? '')
  if (!callId) return fail('gong', 'Use @gong #CALL_ID note: your note')

  await addGongCallNote({ callId, note: ctx.parsed.body })
  await syncGong(ctx.io)
  return ok('gong', 'Gong note added')
}

async function runCalcom(ctx: ActionRunContext): Promise<ActionRunResult> {
  if (!isCalcomConnected()) return fail('calcom', 'Cal.com not connected — Apps → Cal.com')
  if (ctx.parsed.intent !== 'book') {
    return fail('calcom', 'Use @cal book June 10 2026 1pm guests are client@co.com')
  }
  try {
    const input = parseCalcomBookBody(ctx.parsed.body)
    const result = await createCalcomBooking(input)
    if (!result.ok) return fail('calcom', result.message)
    void syncCalcom(ctx.io).catch(() => undefined)
    return ok('calcom', result.message)
  } catch (err) {
    return fail('calcom', err instanceof Error ? err.message : String(err))
  }
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
  registerActionExecutor('claude', wrap('claude', runClaude))
  registerActionExecutor('gemini', wrap('gemini', runGemini))
  registerActionExecutor('cursor', wrap('cursor', runCursor))
  registerActionExecutor('github', wrap('github', runGithub))
  registerActionExecutor('gdocs', wrap('gdocs', runGdocs))
  registerActionExecutor('gong', wrap('gong', runGong))
  registerActionExecutor('calcom', wrap('calcom', runCalcom))
  registerActionExecutor('mind', wrap('mind', runMind))
}
