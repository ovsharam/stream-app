import { useState } from 'react'
import type { StreamSource } from '@shared/types'
import { SOURCE_COLORS } from '@shared/types'
import { api } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'

interface SourceCard {
  id: StreamSource
  name: string
  description: string
  color: string
}

const CARDS: SourceCard[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Inbox threads, filtered — no promotions noise.',
    color: SOURCE_COLORS.gmail
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Channels and DMs from the last 24 hours.',
    color: SOURCE_COLORS.slack
  },
  {
    id: 'x',
    name: 'X',
    description: 'Home timeline — following only, no pure RTs.',
    color: SOURCE_COLORS.x
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'AI answers land in your feed, not a side chat.',
    color: SOURCE_COLORS.perplexity
  }
]

export function Onboarding() {
  const refresh = useAuthStore((s) => s.refresh)
  const setOnboardingComplete = useAuthStore((s) => s.setOnboardingComplete)
  const configured = useAuthStore((s) => s.configured)
  const connected = useAuthStore((s) => s.connected)
  const [perplexityKey, setPerplexityKey] = useState('')
  const [xToken, setXToken] = useState('')
  const [showXToken, setShowXToken] = useState(false)
  const [loading, setLoading] = useState<string | null>(null)

  const openOAuth = async (source: 'gmail' | 'slack' | 'x') => {
    setLoading(source)
    try {
      let url: string
      if (source === 'gmail') {
        const res = await api.authGmail()
        url = res.url
      } else if (source === 'slack') {
        const res = await api.authSlack()
        url = res.url
      } else {
        const res = await api.authX()
        url = res.url
      }
      window.open(url, '_blank', 'noopener,noreferrer')
      setTimeout(() => void refresh(), 3000)
    } catch (err) {
      alert(String(err))
    } finally {
      setLoading(null)
    }
  }

  const connectPerplexity = async () => {
    if (!perplexityKey.trim()) return
    setLoading('perplexity')
    try {
      await api.connectPerplexity(perplexityKey.trim())
      await refresh()
      setPerplexityKey('')
    } catch (err) {
      alert(String(err))
    } finally {
      setLoading(null)
    }
  }

  const connectXToken = async () => {
    if (!xToken.trim()) return
    setLoading('x')
    try {
      await api.connectXToken(xToken.trim())
      await refresh()
      setXToken('')
      setShowXToken(false)
    } catch (err) {
      alert(String(err))
    } finally {
      setLoading(null)
    }
  }

  const handleContinue = async () => {
    await setOnboardingComplete()
    await api.syncAll().catch(() => {})
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-stream-bg p-8">
      <div className="mb-10 text-center">
        <h1 className="font-mono text-2xl font-medium tracking-tight text-stream-primary">STREAM</h1>
        <p className="mt-2 font-sans text-sm text-stream-secondary">
          Connect your signal sources. Skip any you don&apos;t need.
        </p>
      </div>

      <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        {CARDS.map((card) => (
          <div
            key={card.id}
            className="flex flex-col rounded-lg border border-stream-border bg-stream-surface p-5"
            style={{ borderTopColor: card.color, borderTopWidth: 2 }}
          >
            <h2 className="font-mono text-sm font-medium" style={{ color: card.color }}>
              {card.name}
            </h2>
            <p className="mt-2 flex-1 font-sans text-xs leading-relaxed text-stream-secondary">
              {card.description}
            </p>

            {connected[card.id] ? (
              <span className="mt-4 font-mono text-xs text-stream-perplexity">Connected</span>
            ) : card.id === 'perplexity' ? (
              <div className="mt-4 space-y-2">
                <input
                  type="password"
                  value={perplexityKey}
                  onChange={(e) => setPerplexityKey(e.target.value)}
                  placeholder="Paste API key"
                  className="w-full rounded border border-stream-border bg-stream-bg px-2 py-1.5 font-mono text-xs text-stream-primary outline-none"
                />
                <button
                  type="button"
                  onClick={() => void connectPerplexity()}
                  disabled={loading === 'perplexity'}
                  className="w-full rounded py-2 font-mono text-xs text-stream-bg"
                  style={{ backgroundColor: card.color }}
                >
                  {loading === 'perplexity' ? 'Connecting…' : 'Connect'}
                </button>
              </div>
            ) : card.id === 'x' ? (
              <div className="mt-4 space-y-2">
                {configured.x !== false ? (
                  <button
                    type="button"
                    onClick={() => void openOAuth('x')}
                    disabled={!!loading}
                    className="w-full rounded border border-stream-border py-2 font-mono text-xs text-stream-primary hover:bg-stream-border"
                  >
                    {loading === 'x' ? 'Opening…' : 'Connect via OAuth'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setShowXToken(!showXToken)}
                  className="w-full font-mono text-[10px] text-stream-secondary underline"
                >
                  Use bearer token instead
                </button>
                {showXToken && (
                  <>
                    <input
                      type="password"
                      value={xToken}
                      onChange={(e) => setXToken(e.target.value)}
                      placeholder="X API bearer token"
                      className="w-full rounded border border-stream-border bg-stream-bg px-2 py-1.5 font-mono text-xs text-stream-primary outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => void connectXToken()}
                      disabled={loading === 'x'}
                      className="w-full rounded py-2 font-mono text-xs text-stream-bg"
                      style={{ backgroundColor: card.color }}
                    >
                      Connect
                    </button>
                  </>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void openOAuth(card.id as 'gmail' | 'slack')}
                disabled={!!loading || configured[card.id] === false}
                className="mt-4 rounded py-2 font-mono text-xs text-stream-bg disabled:opacity-40"
                style={{ backgroundColor: card.color }}
              >
                {configured[card.id] === false
                  ? 'Not configured'
                  : loading === card.id
                    ? 'Opening…'
                    : 'Connect'}
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void handleContinue()}
        className="mt-10 rounded border border-stream-border px-6 py-2 font-mono text-sm text-stream-primary hover:bg-stream-surface"
      >
        Continue to stream →
      </button>
    </div>
  )
}
