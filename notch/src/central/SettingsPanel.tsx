import { useCallback, useEffect, useState } from 'react'
import {
  DEFAULT_MOBILE_SETTINGS,
  loadMobileSettings,
  saveMobileSettings,
  type MobileClusterSettings,
  type MobileObjective
} from '../lib/mobile-settings'
import { getUserRole, setUserRole, type UserRole } from '../lib/user-role'
import { RailDockSettings } from './RailDockSettings'
import {
  AGENT_REMIND_LATER_OPTIONS,
  loadAgentActionSettings,
  saveAgentActionSettings
} from '@shared/agent-action-settings'

export function useMobileSettings() {
  const [settings, setSettingsState] = useState<MobileClusterSettings>(loadMobileSettings)

  const setSettings = useCallback((patch: Partial<MobileClusterSettings>) => {
    setSettingsState((prev) => {
      const next = { ...prev, ...patch }
      saveMobileSettings(next)
      window.dispatchEvent(new CustomEvent('notch:mobile-settings', { detail: next }))
      return next
    })
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'notch-mobile-settings') setSettingsState(loadMobileSettings())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return { settings, setSettings, reset: () => setSettings(DEFAULT_MOBILE_SETTINGS) }
}

export function SettingsPanel() {
  const { settings, setSettings } = useMobileSettings()
  const [role, setRole] = useState<UserRole>(getUserRole)
  const [agentSettings, setAgentSettings] = useState(loadAgentActionSettings)

  useEffect(() => {
    const refresh = () => setAgentSettings(loadAgentActionSettings())
    window.addEventListener('notch:agent-action-settings', refresh)
    return () => window.removeEventListener('notch:agent-action-settings', refresh)
  }, [])

  return (
    <div className="x-settings-page">
      <header className="x-page-header">
        <div>
          <h1>Settings</h1>
          <p>Profile, mobile cluster, and preferences</p>
        </div>
      </header>
      <div className="x-page-body">
        <div className="x-settings">
      <section className="x-settings-section">
        <h2>User profile</h2>
        <p className="x-settings-desc">Shapes Gong agent summaries and role-aware guidance in feed.</p>
        <div className="x-settings-row x-settings-row-col">
          <span>
            <strong>Role</strong>
            <small>Used to tailor call takeaways and next actions</small>
          </span>
          <select
            value={role}
            onChange={(e) => {
              const next = e.target.value as UserRole
              setRole(next)
              setUserRole(next)
            }}
            className="x-settings-select"
          >
            <option value="ae">Account Executive (AE)</option>
            <option value="am">Account Manager (AM)</option>
            <option value="csm">Customer Success Manager (CSM)</option>
            <option value="fde">Field Deployment Engineer (FDE)</option>
          </select>
        </div>
      </section>

      <section className="x-settings-section">
        <h2>Mobile cluster</h2>
        <p className="x-settings-desc">
          Hidden until <kbd>{settings.hotkeyLabel}</kbd>. Stays running in the menu bar even if you
          close the central window.
        </p>

        <label className="x-settings-row">
          <span>
            <strong>Ambient listening</strong>
            <small>Transcribe meetings in background while on call</small>
          </span>
          <input
            type="checkbox"
            checked={settings.ambientListen}
            onChange={(e) => setSettings({ ambientListen: e.target.checked })}
          />
        </label>

        <label className="x-settings-row">
          <span>
            <strong>Auto-transcribe</strong>
            <small>Stream lines to central cluster feed</small>
          </span>
          <input
            type="checkbox"
            checked={settings.autoTranscribe}
            onChange={(e) => setSettings({ autoTranscribe: e.target.checked })}
          />
        </label>

        <div className="x-settings-row x-settings-row-col">
          <span>
            <strong>Call objective lens</strong>
            <small>How Notch re-ranks suggestions mid-call</small>
          </span>
          <select
            value={settings.objective}
            onChange={(e) => setSettings({ objective: e.target.value as MobileObjective })}
            className="x-settings-select"
          >
            <option value="discovery">Discovery</option>
            <option value="v1_ship">V1 ship ASAP</option>
          </select>
        </div>
      </section>

      <section className="x-settings-section x-settings-dock">
        <h2>Dock station</h2>
        <p className="x-settings-desc">
          Customize the side panel — width, tabs, presets, and defaults while you browse ESPN, run
          agents, and join meetings.
        </p>
        <RailDockSettings />
      </section>

      <section className="x-settings-section">
        <h2>Agent actions</h2>
        <p className="x-settings-desc">
          Default timing for Remind later on inbox drafts. Your exact reply is saved when you snooze.
        </p>
        <label className="x-settings-row">
          <span>
            Remind later
            <small>Applies to all agent inbox items</small>
          </span>
          <select
            value={agentSettings.remindLaterMs}
            onChange={(e) => {
              const next = saveAgentActionSettings({ remindLaterMs: Number(e.target.value) })
              setAgentSettings(next)
            }}
            className="x-settings-select"
          >
            {AGENT_REMIND_LATER_OPTIONS.map((opt) => (
              <option key={opt.ms} value={opt.ms}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="x-settings-section">
        <h2>Hotkey</h2>
        <p className="x-settings-desc">
          <kbd>⌘⇧M</kbd> — show / hide mobile panel (right edge)
        </p>
      </section>
        </div>
      </div>
    </div>
  )
}
