'use client'

type Tab = 'foryou' | 'live' | 'signals'

type Props = {
  tab: Tab
  onTab: (t: Tab) => void
  deal: string
  live: boolean
}

export function FeedChrome({ tab, onTab, deal, live }: Props) {
  return (
    <>
      <aside className="feed-nav-left">
        <div className="feed-logo">N</div>
        <nav>
          {(
            [
              ['foryou', 'Home'],
              ['live', 'Live'],
              ['signals', 'Signals']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`feed-nav-item ${tab === id ? 'active' : ''}`}
              onClick={() => onTab(id)}
            >
              {label}
              {id === 'live' && live && <span className="feed-nav-live-dot" />}
            </button>
          ))}
        </nav>
        <div className="feed-nav-deal">
          <p className="text-[10px] uppercase tracking-wider text-[#71767b]">Active deal</p>
          <p className="text-sm font-bold text-white">{deal}</p>
        </div>
      </aside>

      <header className="feed-topbar">
        <div className="feed-tabs">
          {(
            [
              ['foryou', 'For you'],
              ['live', 'Live'],
              ['signals', 'Signals']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`feed-tab ${tab === id ? 'active' : ''}`}
              onClick={() => onTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

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
          <h2>Mobile cluster</h2>
          <p className="text-xs leading-relaxed text-[#71767b]">
            Green dot at top of screen. <strong className="text-white">⌘⇧Space</strong> for instant assist mid-call.
          </p>
        </div>
      </aside>
    </>
  )
}
