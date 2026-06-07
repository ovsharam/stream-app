'use client'

import { UserMenu } from '@/components/UserMenu'
import { statusMessage } from '@/lib/dashboard-status'
import { useDataDashboard } from '@/hooks/useDataDashboard'
import type { DashboardActivity, DashboardActivityKind } from '@shared/dashboard'
import { emptyIntentionBlock, emptyInsights } from '@shared/dashboard'
import type { IntentionEpisode } from '@shared/intention-episode'
import { formatEpisodeChain } from '@shared/intention-episode'

function formatTs(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

function kindLabel(kind: DashboardActivityKind): string {
  return kind.replace(/_/g, ' ')
}

function kindColor(kind: DashboardActivityKind): string {
  switch (kind) {
    case 'starred_moment':
      return 'bg-amber-500/20 text-amber-200'
    case 'meeting_signal':
      return 'bg-sky-500/20 text-sky-200'
    case 'meeting_ended':
      return 'bg-violet-500/20 text-violet-200'
    case 'operator_event':
      return 'bg-teal-500/20 text-teal-200'
    case 'kb_datapoint':
      return 'bg-emerald-500/20 text-emerald-200'
    case 'stream_item':
      return 'bg-zinc-500/20 text-zinc-200'
    case 'intention_episode':
      return 'bg-fuchsia-500/20 text-fuchsia-200'
    default:
      return 'bg-zinc-700/40 text-zinc-300'
  }
}

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/80 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-100">{value}</p>
      {sub ? <p className="mt-1 text-xs text-zinc-500">{sub}</p> : null}
    </div>
  )
}

function weightColor(weight: number): string {
  if (weight >= 0.75) return 'text-emerald-300'
  if (weight >= 0.5) return 'text-amber-200'
  if (weight >= 0.3) return 'text-zinc-300'
  return 'text-zinc-500'
}

function EpisodeRow({ episode }: { episode: IntentionEpisode }) {
  const ts = episode.endedAt ?? episode.startedAt
  return (
    <div className="border-b border-zinc-800/80 px-4 py-3 last:border-0">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <span>{formatTs(ts)}</span>
        <span className="rounded bg-fuchsia-500/15 px-2 py-0.5 text-fuchsia-200">
          {episode.outcome ?? episode.status}
        </span>
        {episode.reactionTier ? (
          <span className="rounded bg-zinc-800 px-2 py-0.5">{episode.reactionTier}</span>
        ) : null}
        {episode.dominantIntention ? (
          <span className="rounded bg-violet-500/15 px-2 py-0.5 text-violet-200">
            {episode.dominantIntention}
          </span>
        ) : null}
        <span className={`ml-auto font-mono tabular-nums ${weightColor(episode.behavioralWeight)}`}>
          w={episode.behavioralWeight.toFixed(2)}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-200">
        {episode.stimulusSource ?? episode.stimulusType}
        {episode.stimulusLabel ? ` · ${episode.stimulusLabel}` : ''}
      </p>
      <p className="mt-1 font-mono text-xs text-zinc-500">{formatEpisodeChain(episode.eventChain)}</p>
      <p className="mt-1 text-xs text-zinc-600">
        depth {episode.commitmentDepth}
        {episode.latencies.reactionMs != null
          ? ` · react ${Math.round(episode.latencies.reactionMs / 1000)}s`
          : ''}
        {episode.latencies.commitmentMs != null
          ? ` · commit ${Math.round(episode.latencies.commitmentMs / 1000)}s`
          : ''}
        {episode.latencies.dwellMs != null
          ? ` · dwell ${Math.round(episode.latencies.dwellMs / 1000)}s`
          : ''}
      </p>
    </div>
  )
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`
}

function MixBar({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className="font-mono text-zinc-300">{pct(value)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div className="h-full rounded-full bg-violet-500/70" style={{ width: pct(value) }} />
      </div>
    </div>
  )
}

function ActivityRow({ item }: { item: DashboardActivity }) {
  return (
    <div className="flex gap-3 border-b border-zinc-800/80 px-4 py-3 last:border-0">
      <div className="w-36 shrink-0 text-xs text-zinc-500">{formatTs(item.ts)}</div>
      <span className={`shrink-0 rounded px-2 py-0.5 text-[10px] uppercase tracking-wide ${kindColor(item.kind)}`}>
        {kindLabel(item.kind)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-zinc-100">{item.title}</p>
        {item.detail ? <p className="mt-0.5 text-sm text-zinc-400">{item.detail}</p> : null}
      </div>
    </div>
  )
}

export default function MeasurePage() {
  const { snapshot, connected, error, loading, refresh, apiConfigured, apiStatus } = useDataDashboard()

  if (loading && !snapshot) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-[#0a0a0a] text-zinc-400"
        style={{ color: '#a1a1aa' }}
      >
        Loading Scope Measure…
      </div>
    )
  }

  if (error && !snapshot) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0a] px-6 text-center">
        <p className="text-red-300">{error}</p>
        <p className="max-w-md text-sm text-zinc-500">
          Set <code className="text-zinc-300">STREAM_API_URL</code> on the server (Vercel env) to your STREAM API (e.g. a
          Cloudflare Tunnel to local <code className="text-zinc-300">:3131</code>) or run locally with{' '}
          <code className="text-zinc-300">npm run dev</code> in <code className="text-zinc-300">measure-site</code>.
        </p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-700"
        >
          Retry
        </button>
      </div>
    )
  }

  if (!snapshot) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0a0a0a] px-6 text-center"
        style={{ color: '#a1a1aa' }}
      >
        <p style={{ color: '#fca5a5' }}>Dashboard failed to initialize.</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-700"
        >
          Retry
        </button>
      </div>
    )
  }

  const { counts, moments, activity, intention = emptyIntentionBlock(), insights = emptyInsights() } = snapshot
  const { stats: intentionStats, episodes } = intention
  const { agents, traces, engagements, streamBySource, intentionMix, taskSessions, decisions } = insights
  const topEventTypes = Object.entries(counts.operatorEventsByType).slice(0, 6)
  const operatorEventTypeCount = Object.keys(counts.operatorEventsByType).length
  const fde = counts.fde

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-800 bg-[#0a0a0a]/95 px-6 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-zinc-600">Applied Scope</p>
            <h1 className="mt-1 text-xl font-semibold">Scope Measure</h1>
            <p className="text-sm text-zinc-500">
              Browser ops console — live telemetry &amp; moments from Notch clients (not part of the desktop app)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs ${
                connected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-500'}`} />
              {connected ? 'Live stream' : 'Polling'}
            </span>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900"
            >
              Refresh
            </button>
            <UserMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        {!apiConfigured && !apiStatus.checking ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <strong className="font-medium">Waiting for live data.</strong> {statusMessage(apiStatus)}
            {apiStatus.apiUrl ? (
              <span className="mt-1 block text-xs text-amber-200/80">
                Target: <code className="rounded bg-black/30 px-1 py-0.5">{apiStatus.apiUrl}</code>
              </span>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            API error: {error}
          </div>
        ) : null}
        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">What we measure</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Stream items" value={counts.streamItems} />
            <StatCard label="Operator events" value={counts.operatorEvents} sub={`${operatorEventTypeCount} event types`} />
            <StatCard label="Engagements" value={counts.engagements} sub="client deals" />
            <StatCard
              label="Graph edges"
              value={counts.graph.edges}
              sub={`${counts.graph.entities} entities · ${counts.graph.deals} deals${counts.graph.falkorConnected ? ' · Falkor live' : ''}`}
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Meetings" value={counts.fde.meetingRecords} />
            <StatCard label="Starred moments" value={counts.fde.starredMoments} />
            <StatCard label="Meeting signals" value={counts.fde.signals} />
            <StatCard label="Assist predictions" value={counts.fde.predictions} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="KB entities" value={counts.kb.entities} sub="personal graph store" />
            <StatCard label="KB datapoints" value={counts.kb.datapoints} sub="ingested items" />
            <StatCard label="Action traces" value={counts.kb.traces} />
            <StatCard
              label="Requirements"
              value={counts.fde.requirements}
              sub={`${counts.fde.buildRuns} builds · ${counts.fde.decisionEvents} decisions`}
            />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Transcript chunks" value={fde.transcriptChunks} />
            <StatCard label="Extraction revisions" value={fde.extractionRevisions} />
            <StatCard label="Feedback events" value={fde.feedbackEvents} />
            <StatCard label="Assist invocations" value={fde.assistInvocations} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Agent proposals"
              value={agents.total}
              sub={`${agents.interactionLog} interaction logs`}
            />
            <StatCard label="Training sessions" value={insights.trainingSessions} sub="with feed or compose activity" />
            <StatCard
              label="Supabase sync"
              value={insights.supabaseConfigured ? 'On' : 'Off'}
              sub={insights.supabaseConfigured ? 'credentials set' : 'local SQLite only'}
            />
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">Stream by source</h2>
            <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              {streamBySource.length === 0 ? (
                <p className="text-sm text-zinc-500">No stream items yet.</p>
              ) : (
                streamBySource.slice(0, 10).map((row) => {
                  const max = streamBySource[0]?.count ?? 1
                  return (
                    <div key={row.source}>
                      <div className="mb-1 flex justify-between text-xs">
                        <span className="text-zinc-400">{row.source}</span>
                        <span className="font-mono text-zinc-300">{row.count}</span>
                      </div>
                      <div className="h-1 overflow-hidden rounded bg-zinc-800">
                        <div
                          className="h-full bg-sky-500/60"
                          style={{ width: `${Math.round((row.count / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">Text intention mix</h2>
            <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              {intentionMix.sampleSize === 0 ? (
                <p className="text-sm text-zinc-500">No compose action traces yet — mix appears after @ commands run.</p>
              ) : (
                <>
                  <p className="text-xs text-zinc-600">
                    Last {intentionMix.sampleSize} compose traces · dominant{' '}
                    <span className="text-violet-300">{intentionMix.dominant}</span>
                  </p>
                  <MixBar label="Execute" value={intentionMix.execute} />
                  <MixBar label="Explore" value={intentionMix.explore} />
                  <MixBar label="Plan" value={intentionMix.plan} />
                  <MixBar label="Reflect" value={intentionMix.reflect} />
                  <MixBar label="Defer" value={intentionMix.defer} />
                </>
              )}
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">Agent pipeline</h2>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
              {Object.keys(agents.byStatus).length === 0 ? (
                <p className="text-sm text-zinc-500">No agent proposals yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(agents.byStatus).map(([status, n]) => (
                    <span
                      key={status}
                      className="rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300"
                    >
                      {status} <span className="font-mono text-zinc-100">{n}</span>
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-3 space-y-2">
                {agents.recent.slice(0, 5).map((a) => (
                  <div key={a.id} className="border-t border-zinc-800/80 pt-2 first:border-0 first:pt-0">
                    <p className="text-sm text-zinc-200">
                      {a.senderName} · {a.intent.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {a.status} · conf {Math.round(a.confidence * 100)}% · {formatTs(a.ts)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">Action traces</h2>
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
              {traces.length === 0 ? (
                <p className="px-4 py-6 text-sm text-zinc-500">No compose action traces yet.</p>
              ) : (
                traces.map((t) => (
                  <div key={t.id} className="border-b border-zinc-800/80 px-4 py-3 last:border-0">
                    <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                      <span>{formatTs(t.ts)}</span>
                      <span className="rounded bg-teal-500/15 px-2 py-0.5 text-teal-200">{t.dominantIntention}</span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-200">
                      {t.provider ?? 'compose'} · {t.actionKind} → {t.outcome}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {Math.round(t.timeToActionMs / 1000)}s to action
                      {t.rawCommand ? ` · ${t.rawCommand}` : ''}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
              Correlated task sessions
            </h2>
            <div className="overflow-hidden rounded-xl border border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Session</th>
                    <th className="px-4 py-2 font-medium">Duration</th>
                    <th className="px-4 py-2 font-medium">Signals</th>
                    <th className="px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {taskSessions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-zinc-500">
                        No correlated sessions — need feed + compose chains.
                      </td>
                    </tr>
                  ) : (
                    taskSessions.map((s) => (
                      <tr key={s.id} className="border-t border-zinc-800/80">
                        <td className="px-4 py-2 font-mono text-xs text-zinc-400">{s.correlationId.slice(0, 14)}</td>
                        <td className="px-4 py-2 text-zinc-400">{Math.round(s.durationMs / 1000)}s</td>
                        <td className="px-4 py-2 font-mono text-zinc-300">{s.signalCount}</td>
                        <td className="px-4 py-2 font-mono text-zinc-300">{s.actionCount}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">Client engagements</h2>
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
              {engagements.length === 0 ? (
                <p className="px-4 py-6 text-sm text-zinc-500">No engagements recorded.</p>
              ) : (
                engagements.map((e) => (
                  <div key={e.id} className="border-b border-zinc-800/80 px-4 py-3 last:border-0">
                    <p className="text-sm font-medium text-zinc-100">{e.clientName}</p>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {e.stage} · {e.scope}
                      {e.escalationLevel > 0 ? ` · escalated ${e.escalationLevel}` : ''}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-600">
                      {e.meetingCount} meetings · {e.feedItemCount} feed links · {formatTs(e.updatedAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">FDE decision timeline</h2>
            <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
              {decisions.length === 0 ? (
                <p className="px-4 py-6 text-sm text-zinc-500">No decision events yet.</p>
              ) : (
                decisions.map((d) => (
                  <div key={d.id} className="border-b border-zinc-800/80 px-4 py-3 last:border-0">
                    <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                      <span>{formatTs(d.ts)}</span>
                      <span className="rounded bg-violet-500/15 px-2 py-0.5 text-violet-200">{d.phase}</span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-200">{d.type.replace(/_/g, ' ')}</p>
                    {d.detail ? <p className="mt-0.5 text-xs text-zinc-500">{d.detail}</p> : null}
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Intention episodes
          </h2>
          <p className="mb-4 text-sm text-zinc-500">
            Behavioral intention from operator events — reaction speed, commitment depth, and chains. Outcome
            counts are all-time; chain counts and averages use the last {intentionStats.statsSampleSize} closed
            episodes.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Episodes (all time)" value={intentionStats.total} sub={`${intentionStats.open} open · ${intentionStats.closed} closed`} />
            <StatCard
              label="Avg intention weight"
              value={intentionStats.avgBehavioralWeight.toFixed(2)}
              sub={`${intentionStats.committed} committed · ${intentionStats.abandoned} abandoned · ${intentionStats.engaged} engaged`}
            />
            <StatCard
              label="Avg reaction"
              value={
                intentionStats.avgReactionMs > 0
                  ? `${Math.round(intentionStats.avgReactionMs / 1000)}s`
                  : '—'
              }
              sub="stream items with depth ≥ 2"
            />
            <StatCard label="Ignored episodes" value={intentionStats.ignored} sub="browsed, no engagement" />
          </div>

          <div className="mt-4 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-600">
                Top event chains
              </h3>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
                {intentionStats.topChains.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-zinc-500">No closed episodes yet.</p>
                ) : (
                  intentionStats.topChains.map((row) => (
                    <div
                      key={row.chain}
                      className="flex items-start justify-between gap-3 border-b border-zinc-800/80 px-4 py-2.5 last:border-0"
                    >
                      <p className="font-mono text-xs text-zinc-400">{row.chain}</p>
                      <span className="shrink-0 font-mono text-xs text-zinc-200">{row.count}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
            <div>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-600">
                Reaction speed by feed source
              </h3>
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
                {intentionStats.reactionBySource.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-zinc-500">No feed-item reaction timings yet.</p>
                ) : (
                  intentionStats.reactionBySource.map((row) => (
                    <div
                      key={row.source}
                      className="flex items-center justify-between border-b border-zinc-800/80 px-4 py-2.5 last:border-0"
                    >
                      <span className="text-sm text-zinc-300">{row.source}</span>
                      <span className="font-mono text-xs text-zinc-400">
                        med {Math.round(row.medianMs / 1000)}s · n={row.count}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="mt-4 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
            {episodes.length === 0 ? (
              <p className="px-4 py-6 text-sm text-zinc-500">
                Episodes appear when you interact in Notch — impression → select → compose, etc.
              </p>
            ) : (
              episodes.map((ep) => <EpisodeRow key={ep.id} episode={ep} />)
            )}
          </div>
        </section>

        {topEventTypes.length > 0 ? (
          <section>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
              Operator event types
            </h2>
            <div className="flex flex-wrap gap-2">
              {topEventTypes.map(([type, n]) => (
                <span
                  key={type}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-300"
                >
                  <span className="text-zinc-500">{type.replace(/_/g, ' ')}</span>{' '}
                  <span className="font-mono text-zinc-100">{n}</span>
                </span>
              ))}
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
              Starred moments
            </h2>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
              {moments.starred.length === 0 ? (
                <p className="px-4 py-6 text-sm text-zinc-500">No starred moments yet.</p>
              ) : (
                moments.starred.map((m) => (
                  <div key={m.id} className="border-b border-zinc-800/80 px-4 py-3 last:border-0">
                    <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                      <span>{formatTs(m.ts)}</span>
                      {m.reason ? (
                        <span className="rounded bg-amber-500/15 px-2 py-0.5 text-amber-200">{m.reason}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-sm text-zinc-200">{m.text}</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {m.meetingTitle ?? m.sessionId.slice(0, 12)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div>
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
              Meeting signals
            </h2>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/50">
              {moments.signals.length === 0 ? (
                <p className="px-4 py-6 text-sm text-zinc-500">No meeting signals yet.</p>
              ) : (
                moments.signals.map((s) => (
                  <div key={s.id} className="border-b border-zinc-800/80 px-4 py-3 last:border-0">
                    <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                      <span>{formatTs(s.ts)}</span>
                      <span className="rounded bg-sky-500/15 px-2 py-0.5 text-sky-200">{s.type}</span>
                    </div>
                    <p className="mt-1 text-sm text-zinc-200">{s.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Recent meetings
          </h2>
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-zinc-900/80 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Title</th>
                  <th className="px-4 py-2 font-medium">Started</th>
                  <th className="px-4 py-2 font-medium">Duration</th>
                  <th className="px-4 py-2 font-medium">Signals</th>
                  <th className="px-4 py-2 font-medium">Starred</th>
                </tr>
              </thead>
              <tbody>
                {moments.meetings.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-zinc-500">
                      No meeting records yet.
                    </td>
                  </tr>
                ) : (
                  moments.meetings.map((m) => (
                    <tr key={m.sessionId} className="border-t border-zinc-800/80">
                      <td className="px-4 py-2 text-zinc-200">{m.title ?? m.sessionId.slice(0, 10)}</td>
                      <td className="px-4 py-2 text-zinc-400">{formatTs(m.startedAt)}</td>
                      <td className="px-4 py-2 text-zinc-400">
                        {m.durationMs != null ? `${Math.round(m.durationMs / 60000)}m` : '—'}
                      </td>
                      <td className="px-4 py-2 font-mono text-zinc-300">{m.signalCount}</td>
                      <td className="px-4 py-2 font-mono text-zinc-300">{m.starredCount}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-zinc-500">
            Live activity feed
          </h2>
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40">
            {activity.length === 0 ? (
              <p className="px-4 py-6 text-sm text-zinc-500">Waiting for events from Notch clients…</p>
            ) : (
              activity.map((item) => <ActivityRow key={item.id} item={item} />)
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
