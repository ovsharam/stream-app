import { useEffect, useState, type RefObject } from 'react'
import {
  IconApps,
  IconBookmark,
  IconGlobe,
  IconLinkedin,
  IconNotch,
  IconPlus,
  IconPortal,
  IconRadar,
  IconSettings,
  IconSpark,
  IconStream,
  IconYoutube
} from './Icons'
import { integrationApi } from '../lib/api'
import {
  listUnpinnedApps,
  type NavApp
} from './navAppsStore'

type Tab = 'foryou' | 'signals'
type Area = 'work' | 'feed'
export type Page = 'stream' | 'settings' | 'integrations' | 'navapp' | 'build' | 'notes' | 'mind' | 'pipeline'

export type NavTarget = {
  id: string
  label: string
  hint: string
  area?: Area
  tab?: Tab
  page?: Page
  navAppId?: string
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
    id: 'pipeline',
    label: 'Pipeline',
    hint: 'Deal conversion · FDE layer',
    page: 'pipeline'
  },
  {
    id: 'notes',
    label: 'Notes',
    hint: 'Capture & reminders',
    page: 'notes'
  },
  {
    id: 'mind',
    label: 'Mind',
    hint: 'Knowledge graph',
    page: 'mind'
  },
  {
    id: 'build',
    label: 'Build Dojo',
    hint: 'Agent builds & chat',
    page: 'build'
  }
]

const SYSTEM_NAV: NavTarget[] = [
  {
    id: 'integrations',
    label: 'Apps',
    hint: 'Desktop apps & integrations',
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
  navApps: NavApp[]
  activeNavAppId: string | null
  /** Pinned workspace tab (YouTube, LinkedIn, etc.) — not embed navapp player. */
  activePinnedAppId: string | null
  onNavigate: (target: NavTarget) => void
  onOpenNavApp: (appId: string) => void
  onPinApp: (appId: string) => void
  onRemoveNavApp: (appId: string) => void
  onGoHome: () => void
  themeOpen: boolean
  onThemeToggle: () => void
  themeBtnRef: RefObject<HTMLButtonElement>
  onBrowseApps: () => void
}

function NavIcon({ id }: { id: string }) {
  const cls = 'x-side-nav-icon'
  switch (id) {
    case 'home':
      return <IconPortal className={cls} />
    case 'feed':
      return <IconStream className={cls} />
    case 'notes':
      return <IconBookmark className={cls} />
    case 'mind':
      return <IconSpark className={cls} />
    case 'build':
      return <IconRadar className={cls} />
    case 'signals':
      return <IconRadar className={cls} />
    case 'integrations':
      return <IconApps className={cls} />
    case 'settings':
      return <IconSettings className={cls} />
    case 'youtube':
      return <IconYoutube className={cls} />
    case 'linkedin':
      return <IconLinkedin className={cls} />
    case 'gmail':
    case 'slack':
    case 'discord':
    case 'monday':
    case 'gdocs':
    case 'github':
      return <span className={`${cls} x-side-nav-icon-letter`}>{id.slice(0, 1).toUpperCase()}</span>
    default:
      return <IconGlobe className={cls} />
  }
}

function isActive(
  target: NavTarget,
  page: Page,
  area: Area,
  tab: Tab,
  activeNavAppId: string | null,
  activePinnedAppId: string | null
): boolean {
  if (target.navAppId) {
    if (activePinnedAppId) return activePinnedAppId === target.navAppId
    return page === 'navapp' && activeNavAppId === target.navAppId
  }
  if (target.id === 'home') {
    return page === 'stream' && area === 'work' && activePinnedAppId == null
  }
  if (target.page) return page === target.page
  return page === 'stream' && target.area === area && (target.tab == null || target.tab === tab)
}

function NavButton({
  target,
  active,
  live,
  onClick,
  onRemove
}: {
  target: NavTarget
  active: boolean
  live: boolean
  onClick: () => void
  onRemove?: () => void
}) {
  return (
    <div className={`x-side-nav-item-wrap${active ? ' active' : ''}`}>
      <button
        type="button"
        className={`x-side-nav-item ${active ? 'active' : ''}`}
        onClick={onClick}
        aria-current={active ? 'page' : undefined}
      >
        <span className="x-side-nav-icon-wrap">
          <NavIcon id={target.id} />
          {target.showLiveBadge && live ? <span className="x-side-nav-live" aria-label="Live call" /> : null}
        </span>
        <span className="x-side-nav-text">
          <span className="x-side-nav-label">{target.label}</span>
          <span className="x-side-nav-hint">{target.hint}</span>
        </span>
      </button>
      {onRemove ? (
        <button type="button" className="x-side-nav-item-remove" onClick={onRemove} title={`Remove ${target.label}`}>
          ×
        </button>
      ) : null}
    </div>
  )
}

function pinHint(app: NavApp): string {
  if (app.surface === 'workspace') return 'Opens in app tab'
  if (app.miniPlayer) return 'Mini player when you leave'
  return 'Pinned app'
}

function PinAppPicker({
  navApps,
  onPin,
  onCancel,
  onBrowseApps
}: {
  navApps: NavApp[]
  onPin: (id: string) => void
  onCancel: () => void
  onBrowseApps: () => void
}) {
  const [connected, setConnected] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void integrationApi
      .connections()
      .then((data) => {
        if (!cancelled) setConnected(data.connected ?? {})
      })
      .catch(() => {
        if (!cancelled) setConnected({})
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const unpinned = listUnpinnedApps(connected, navApps)

  return (
    <div className="x-side-nav-pin-picker">
      {loading ? (
        <p className="x-side-nav-pin-picker-empty">Loading apps…</p>
      ) : unpinned.length === 0 ? (
        <div className="x-side-nav-pin-picker-empty">
          <p>Nothing to pin — connect more in Apps.</p>
          <button type="button" className="x-side-nav-pin-picker-link" onClick={onBrowseApps}>
            Open Apps
          </button>
        </div>
      ) : (
        <ul className="x-side-nav-pin-picker-list">
          {unpinned.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className="x-side-nav-pin-picker-item"
                onClick={() => onPin(entry.id)}
              >
                <NavIcon id={entry.id} />
                <span className="x-side-nav-pin-picker-text">
                  <strong>{entry.label}</strong>
                  <span>{entry.integrationId ? 'Connected' : entry.description.slice(0, 42)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="x-side-nav-pin-picker-cancel" onClick={onCancel}>
        Cancel
      </button>
    </div>
  )
}

export function SideNav({
  page,
  area,
  tab,
  live,
  navApps,
  activeNavAppId,
  activePinnedAppId,
  onNavigate,
  onOpenNavApp,
  onPinApp,
  onRemoveNavApp,
  onGoHome,
  onBrowseApps,
  themeOpen,
  onThemeToggle,
  themeBtnRef
}: Props) {
  const [addingApp, setAddingApp] = useState(false)

  const appTargets: NavTarget[] = navApps.map((app) => ({
    id: app.id,
    label: app.label,
    hint: pinHint(app),
    navAppId: app.id
  }))

  return (
    <aside className="x-side-nav">
      <div className="x-side-nav-head">
        <button
          type="button"
          className="x-side-nav-brand"
          onClick={onGoHome}
          title="Notch home"
        >
          <IconNotch className="x-side-nav-brand-icon" />
          <span className="x-side-nav-brand-text">
            <strong>Notch</strong>
            <span>Work OS</span>
          </span>
        </button>
      </div>

      <nav className="x-side-nav-groups" aria-label="Main">
        <div className="x-side-nav-group">
          <p className="x-side-nav-group-label">Navigate</p>
          {PRIMARY_NAV.map((target) => (
            <NavButton
              key={target.id}
              target={target}
              active={isActive(target, page, area, tab, activeNavAppId, activePinnedAppId)}
              live={live}
              onClick={() => onNavigate(target)}
            />
          ))}
        </div>

        <div className="x-side-nav-group">
          <p className="x-side-nav-group-label">Pinned</p>
          {appTargets.map((target) => (
            <NavButton
              key={target.id}
              target={target}
              active={isActive(target, page, area, tab, activeNavAppId, activePinnedAppId)}
              live={false}
              onClick={() => onOpenNavApp(target.navAppId!)}
              onRemove={() => onRemoveNavApp(target.navAppId!)}
            />
          ))}
          {addingApp ? (
            <PinAppPicker
              navApps={navApps}
              onPin={(id) => {
                onPinApp(id)
                setAddingApp(false)
              }}
              onCancel={() => setAddingApp(false)}
              onBrowseApps={onBrowseApps}
            />
          ) : (
            <button
              type="button"
              className="x-side-nav-pin-app"
              onClick={() => setAddingApp(true)}
              title="Pin a connected app"
            >
              <IconPlus className="x-side-nav-icon" />
              <span>Pin app</span>
            </button>
          )}
        </div>

        <div className="x-side-nav-group">
          <p className="x-side-nav-group-label">System</p>
          {SYSTEM_NAV.map((target) => (
            <NavButton
              key={target.id}
              target={target}
              active={isActive(target, page, area, tab, activeNavAppId, activePinnedAppId)}
              live={live}
              onClick={() => onNavigate(target)}
            />
          ))}
        </div>
      </nav>

      <div className="x-side-nav-footer">
        <button
          ref={themeBtnRef}
          type="button"
          className="x-side-nav-footer-btn"
          onClick={onThemeToggle}
          title="Theme"
          aria-expanded={themeOpen}
          aria-haspopup="dialog"
        >
          <span className="x-nav-theme-dot" aria-hidden />
          <span>Theme</span>
        </button>
        <div className="x-side-nav-profile" title="Apoorva @ae">
          <div className="x-avatar x-avatar-user">A</div>
          <span className="x-side-nav-profile-text">
            <strong>Apoorva</strong>
            <span>@ae</span>
          </span>
        </div>
      </div>
    </aside>
  )
}

export { PRIMARY_NAV, SYSTEM_NAV }
