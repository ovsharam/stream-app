'use client'

import { useEffect, useState } from 'react'
import { clusterApi } from '@/lib/cluster-api'
import { useCentralStream } from '@/hooks/useCentralStream'
import { FeedColumn } from '@/components/central/FeedColumn'
import { MobileClusterDock } from '@/components/central/MobileClusterDock'

type Tab = 'foryou' | 'live' | 'signals'

export default function CentralClusterPage() {
  const { events, live } = useCentralStream()
  const [deal, setDeal] = useState('Acme Corp')
  const [tab, setTab] = useState<Tab>('foryou')
  const [compose, setCompose] = useState('')

  useEffect(() => {
    void clusterApi.context().then((c) => setDeal(c.activeDeal.company))
  }, [])

  const tabs: { id: Tab; label: string }[] = [
    { id: 'foryou', label: 'For you' },
    { id: 'live', label: 'Live' },
    { id: 'signals', label: 'Signals' }
  ]

  return (
    <>
      <MobileClusterDock />

      <div className="feed-app">
        <aside className="feed-nav-left">
          <div className="feed-logo">N</div>
          <nav>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`feed-nav-item ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
                {t.id === 'live' && live && <span className="feed-nav-live-dot" />}
              </button>
            ))}
          </nav>
          <div className="feed-nav-deal">
            <p className="text-[10px] uppercase tracking-wider text-[#71767b]">Active deal</p>
            <p className="text-sm font-bold text-white">{deal}</p>
          </div>
        </aside>

        <div className="feed-main">
          <header className="feed-topbar">
            <div className="feed-tabs">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`feed-tab ${tab === t.id ? 'active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </header>

          <FeedColumn events={events} live={live} tab={tab} />

          <div className="feed-compose">
            <div className="feed-compose-inner">
              <div className="feed-avatar feed-avatar-sm">You</div>
              <input
                value={compose}
                onChange={(e) => setCompose(e.target.value)}
                placeholder="Post to stream, ask the graph…"
                className="feed-compose-input"
              />
              <button type="button" className="feed-compose-post">
                Post
              </button>
            </div>
          </div>
        </div>

        <aside className="feed-nav-right">
          <div className="feed-widget">
            <h2>Live now</h2>
            <div className="feed-widget-row">
              <span className="feed-widget-live" />
              <div>
                <p className="text-sm font-bold text-white">Acme technical deep-dive</p>
                <p className="text-xs text-[#71767b]">Google Meet · Notch capturing</p>
              </div>
            </div>
          </div>
          <div className="feed-widget">
            <h2>Trending on graph</h2>
            <ul className="feed-trending">
              <li>#EUResidency · 3 deals</li>
              <li>#PilotScope · Acme</li>
              <li>#SCCTemplate · legal</li>
              <li>#BuildPrompt · ready</li>
            </ul>
          </div>
          <div className="feed-widget feed-widget-mobile">
            <h2>↑ Mobile cluster</h2>
            <p className="text-xs leading-relaxed text-[#71767b]">
              Green dot at top. Click it or press <strong className="text-emerald-400">⌘⇧Space</strong> for
              mid-call assist. With Electron, it also floats below your Mac notch.
            </p>
          </div>
        </aside>
      </div>
    </>
  )
}
