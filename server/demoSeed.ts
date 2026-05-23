import { upsertItems, getRecentItems } from './db'
import { normalizeNote } from './normalizer'
import { normalizeGmailThread, normalizeSlackMessage, normalizeXTweet, normalizePerplexityResponse } from './normalizer'

export function seedDemoData(): void {
  if (getRecentItems(1).length > 0) return

  const now = Date.now()
  const items = [
    normalizeGmailThread({
      id: 'demo-thread-1',
      subject: 'Q2 roadmap review — action needed',
      from: { name: 'Sarah Chen', email: 'sarah@acme.co' },
      date: new Date(now - 12 * 60_000),
      body: 'Can you confirm the API migration timeline before Monday? The customer success team is getting questions.',
      labelIds: ['UNREAD', 'INBOX']
    })!,
    normalizeSlackMessage({
      ts: String((now - 25 * 60_000) / 1000),
      channel: 'C1',
      channelName: 'deployments',
      user: { name: 'Alex Rivera', id: 'U1' },
      text: 'Staging deploy green. Production window opens at 3pm PT — ping if you want to hold.'
    }),
    normalizeXTweet({
      id: 'demo-tweet-1',
      text: 'The best products don’t add features — they remove noise. Building toward calmer defaults.',
      author: { name: 'Naval', username: 'naval' },
      created_at: new Date(now - 45 * 60_000).toISOString(),
      public_metrics: { like_count: 420, retweet_count: 88 }
    })!,
    normalizePerplexityResponse({
      query: 'What changed in my stream?',
      answer:
        'You have one unread Gmail from Sarah about the Q2 roadmap, a Slack update on staging deploys, and a post from Naval on X. The highest-priority item is Sarah’s email — it blocks customer success.'
    }),
    normalizeNote('Follow up with Sarah after standup re: API migration date.')
  ]

  upsertItems(items)
}
