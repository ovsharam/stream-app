'use client'

import { useEffect, useState } from 'react'
import { clusterApi } from '@/lib/cluster-api'
import type { ClusterContext, DashboardTab } from '@shared/cluster'
import { DashboardSidebar } from '@/components/dashboard/DashboardSidebar'
import { DealHeader } from '@/components/dashboard/DealHeader'
import { IntegrationsGrid } from '@/components/dashboard/IntegrationsGrid'
import { ActionsQueue } from '@/components/dashboard/ActionsQueue'
import { MeetingStrip } from '@/components/dashboard/MeetingStrip'
import { SignalFeed } from '@/components/dashboard/SignalFeed'
import { ActivityPanel } from '@/components/dashboard/ActivityPanel'

export default function DashboardPage() {
  const [ctx, setCtx] = useState<ClusterContext | null>(null)
  const [tab, setTab] = useState<DashboardTab>('overview')

  useEffect(() => {
    void clusterApi.context().then(setCtx)
    const t = setInterval(() => void clusterApi.context().then(setCtx), 12000)
    return () => clearInterval(t)
  }, [])

  if (!ctx) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#f5f5f7]">
        <p className="text-sm text-neutral-500">Loading central cluster…</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-[#f5f5f7] text-neutral-900">
      <DashboardSidebar tab={tab} onTab={setTab} ctx={ctx} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-neutral-200/80 bg-white/80 px-6 py-3 backdrop-blur-xl">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Central cluster</p>
            <h1 className="text-lg font-semibold">Notch Command</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-700">
              Mobile droplet active
            </span>
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[10px] text-neutral-500">Simulation</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          {ctx.meeting && <MeetingStrip meeting={ctx.meeting} />}

          {tab === 'overview' && (
            <div className="mt-6 grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2 space-y-6">
                <DealHeader deal={ctx.activeDeal} signals={ctx.recentSignals} />
                <SignalFeed signals={ctx.recentSignals} />
              </div>
              <div className="space-y-6">
                <ActionsQueue actions={ctx.actions} compact />
                <IntegrationsGrid integrations={ctx.integrations.slice(0, 4)} />
              </div>
            </div>
          )}

          {tab === 'integrations' && (
            <div className="mt-6">
              <IntegrationsGrid integrations={ctx.integrations} full />
            </div>
          )}

          {tab === 'actions' && (
            <div className="mt-6 max-w-2xl">
              <ActionsQueue actions={ctx.actions} />
            </div>
          )}

          {tab === 'meetings' && ctx.meeting && (
            <div className="mt-6 max-w-3xl space-y-4">
              <MeetingStrip meeting={ctx.meeting} expanded />
              <div className="rounded-xl border border-neutral-200 bg-white p-5">
                <h2 className="text-sm font-semibold">Live meeting stream</h2>
                <p className="mt-2 text-sm text-neutral-600">
                  Transcript, Gong sync, and comment thread stream here when a call is active. Use the mobile droplet
                  for rapid in-call assist — context is shared with this cluster.
                </p>
              </div>
            </div>
          )}

          {tab === 'activity' && (
            <div className="mt-6">
              <ActivityPanel />
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
