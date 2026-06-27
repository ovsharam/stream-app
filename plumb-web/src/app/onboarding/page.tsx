'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function OnboardingPage() {
  const router = useRouter()
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const name = orgName.trim()
    if (!name) return

    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/onboarding/create-org', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      })

      const data = (await res.json()) as { error?: string }

      if (!res.ok) {
        throw new Error(data.error ?? 'Something went wrong')
      }

      // Org created — redirect to the main app
      router.push('/app')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-bg">
      <div className="w-full max-w-md">
        <div className="rounded-xl border border-line bg-panel p-8">
          <h1 className="text-2xl font-semibold text-text mb-1">Create your workspace</h1>
          <p className="text-sm text-text-muted mb-8">
            Your Plumb workspace is where your team manages FDE engagements, meetings, and builds.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="orgName" className="text-xs text-text-muted uppercase tracking-wider">
                Workspace name
              </label>
              <input
                id="orgName"
                type="text"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="Acme Corp FDE"
                className="mt-2 w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                autoFocus
              />
              <p className="mt-1.5 text-xs text-text-muted">
                Usually your company name or team name.
              </p>
            </div>

            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !orgName.trim()}
              className="w-full bg-accent text-white py-2.5 rounded-lg font-medium text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Creating workspace…' : 'Create workspace'}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-text-muted">
          You can invite teammates after setup.
        </p>
      </div>
    </div>
  )
}
