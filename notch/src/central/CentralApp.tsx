import { useState } from 'react'
import { FeedPost } from './FeedPost'
import { LiveTranscript } from './LiveTranscript'
import { useCentralStream } from './useCentralStream'

type Tab = 'foryou' | 'live' | 'signals'

export function CentralApp() {
  const { events, live, transcriptLines, meetActive } = useCentralStream()
  const [tab, setTab] = useState<Tab>('foryou')
  const [compose, setCompose] = useState('')

  const meetEvent = events.find((e) => e.joinable && e.meetingLink)
  const filtered =
    tab === 'live'
      ? events.filter((e) =>
          ['transcript_live', 'assist', 'transcript_done'].includes(e.kind)
        )
      : tab === 'signals'
        ? events.filter((e) => ['signal', 'insight', 'build_prompt'].includes(e.kind))
        : events

  const tabs: { id: Tab; label: string }[] = [
    { id: 'foryou', label: 'For you' },
    { id: 'live', label: 'Live' },
    { id: 'signals', label: 'Signals' }
  ]

  return (
    <div className="x-app">
      <aside className="x-nav">
        <div className="x-logo">N</div>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`x-nav-item ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'live' && live && <span className="x-nav-live" />}
          </button>
        ))}
        <button type="button" className="x-post-btn">
          Post
        </button>
        <div className="x-nav-user">
          <div className="x-avatar x-avatar-sm">A</div>
          <div>
            <p className="x-nav-user-name">You</p>
            <p className="x-nav-user-handle">@ae</p>
          </div>
        </div>
      </aside>

      <main className="x-main">
        <header className="x-topbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`x-tab ${tab === t.id ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </header>

        <div className="x-compose">
          <div className="x-avatar x-avatar-sm">A</div>
          <input
            value={compose}
            onChange={(e) => setCompose(e.target.value)}
            placeholder="What's happening?"
            className="x-compose-input"
          />
        </div>

        {(meetActive || transcriptLines.length > 0) && (
          <LiveTranscript
            lines={transcriptLines}
            active={meetActive}
            meetingLink={meetEvent?.meetingLink}
          />
        )}

        {filtered.map((e, i) => (
          <FeedPost key={e.id} event={e} isNew={live && i === 0} />
        ))}

        {live && (
          <div className="x-loading">
            <span /><span /><span />
          </div>
        )}
      </main>

      <aside className="x-rail">
        <div className="x-search">
          <input placeholder="Search graph" readOnly />
        </div>
        <div className="x-widget">
          <h2>Live now</h2>
          <p className="x-widget-title">Acme technical deep-dive</p>
          <p className="x-widget-sub">Notch AI transcribing · Mobile droplet active</p>
        </div>
        <div className="x-widget">
          <h2>What's happening</h2>
          <ul>
            <li>#EUResidency</li>
            <li>#PilotScope</li>
            <li>#BuildPrompt</li>
          </ul>
        </div>
        <div className="x-widget x-widget-tip">
          <h2>Mobile cluster</h2>
          <p>Green dot below your notch · ⌘⇧Space for mid-call assist</p>
        </div>
      </aside>
    </div>
  )
}
