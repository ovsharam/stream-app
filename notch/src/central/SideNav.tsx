import type { RefObject } from 'react'
import {
  IconApps,
  IconNotch,
  IconPortal,
  IconRadar,
  IconSettings,
  IconStream
} from './Icons'

type Tab = 'foryou' | 'signals'
type Area = 'work' | 'feed'
type Page = 'stream' | 'settings' | 'integrations'

export type NavTarget = {
  id: string
  label: string
  hint: string
  area?: Area
  tab?: Tab
  page?: Page
  showLiveBadge?: boolean
}

const PRIMARY_NAV: NavTarget[] = [
  {
    id: 'home',
    label: 'Home',
    hint: 'Chat & agents',
    area: 'work',
    showLiveBadge: true
  },
  {
    id: 'feed',
    label: 'Feed',
    hint: 'Integration stream',
    area: 'feed',
    tab: 'foryou'
  },
  {
    id: 'signals',
    label: 'Signals',
    hint: 'AI & build prompts',
    area: 'feed',
    tab: 'signals'
  }
]

const SYSTEM_NAV: NavTarget[] = [
  {
    id: 'integrations',
    label: 'Apps',
    hint: 'Connect tools',
    page: 'integrations'
  },
  {
    id: 'settings',
    label: 'Settings',
    hint: 'Account & prefs',
    page: 'settings'
  }
]

type Props = {
  page: Page
  area: Area
  tab: Tab
  live: boolean
  compact?: boolean
  onNavigate: (target: NavTarget) => void
  onGoHome: () => void
  themeOpen: boolean
  onThemeToggle: () => void
  themeBtnRef: RefObject<HTMLButtonElement>
}

function NavIcon({ id }: { id: string }) {
  const cls = 'x-side-nav-icon'
  switch (id) {
    case 'home':
      return <IconPortal className={cls} />
    case 'feed':
      return <IconStream className={cls} />
    case 'signals':
      return <IconRadar className={cls} />
    case 'integrations':
      return <IconApps className={cls} />
    case 'settings':
      return <IconSettings className={cls} />
    default:
      return <IconPortal className={cls} />
  }
}

function isActive(target: NavTarget, page: Page, area: Area, tab: Tab): boolean {
  if (target.page) return page === target.page
  return page === 'stream' && target.area === area && (target.tab == null || target.tab === tab)
}

function NavButton({
  target,
  active,
  live,
  compact,
  onClick
}: {
  target: NavTarget
  active: boolean
  live: boolean
  compact?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      className={`x-side-nav-item ${active ? 'active' : ''}${compact ? ' x-side-nav-item-compact' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      title={compact ? `${target.label} — ${target.hint}` : undefined}
    >
      <span className="x-side-nav-icon-wrap">
        <NavIcon id={target.id} />
        {target.showLiveBadge && live ? <span className="x-side-nav-live" aria-label="Live call" /> : null}
      </span>
      {compact ? null : (
        <span className="x-side-nav-text">
          <span className="x-side-nav-label">{target.label}</span>
          <span className="x-side-nav-hint">{target.hint}</span>
        </span>
      )}
    </button>
  )
}

export function SideNav({
  page,
  area,
  tab,
  live,
  compact = false,
  onNavigate,
  onGoHome,
  themeOpen,
  onThemeToggle,
  themeBtnRef
}: Props) {
  return (
    <aside className={`x-side-nav${compact ? ' x-side-nav-compact' : ''}`}>
      <button
        type="button"
        className="x-side-nav-brand"
        onClick={onGoHome}
        title="Notch home"
      >
        <IconNotch className="x-side-nav-brand-icon" />
        {compact ? null : (
          <span className="x-side-nav-brand-text">
            <strong>Notch</strong>
            <span>Work OS</span>
          </span>
        )}
      </button>

      <nav className="x-side-nav-groups" aria-label="Main">
        <div className="x-side-nav-group">
          {compact ? null : <p className="x-side-nav-group-label">Navigate</p>}
          {PRIMARY_NAV.map((target) => (
            <NavButton
              key={target.id}
              target={target}
              active={isActive(target, page, area, tab)}
              live={live}
              compact={compact}
              onClick={() => onNavigate(target)}
            />
          ))}
        </div>

        <div className="x-side-nav-group">
          {compact ? null : <p className="x-side-nav-group-label">System</p>}
          {SYSTEM_NAV.map((target) => (
            <NavButton
              key={target.id}
              target={target}
              active={isActive(target, page, area, tab)}
              live={live}
              compact={compact}
              onClick={() => onNavigate(target)}
            />
          ))}
        </div>
      </nav>

      <div className="x-side-nav-footer">
        <button
          ref={themeBtnRef}
          type="button"
          className={`x-side-nav-footer-btn${compact ? ' x-side-nav-footer-btn-compact' : ''}`}
          onClick={onThemeToggle}
          title="Theme"
          aria-expanded={themeOpen}
          aria-haspopup="dialog"
        >
          <span className="x-nav-theme-dot" aria-hidden />
          {compact ? null : <span>Theme</span>}
        </button>
        <div
          className={`x-side-nav-profile${compact ? ' x-side-nav-profile-compact' : ''}`}
          title="Apoorva @ae"
        >
          <div className="x-avatar x-avatar-user">A</div>
          {compact ? null : (
            <span className="x-side-nav-profile-text">
              <strong>Apoorva</strong>
              <span>@ae</span>
            </span>
          )}
        </div>
      </div>
    </aside>
  )
}

export { PRIMARY_NAV, SYSTEM_NAV }
