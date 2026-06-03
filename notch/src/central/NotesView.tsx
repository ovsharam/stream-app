import { useCallback, useEffect, useMemo, useState } from 'react'
import type { CaptureDestination, CaptureProfile, CaptureState, Reminder } from '@shared/capture'
import { captureApi, clusterApi } from '../lib/api'

type Props = {
  onOpenIntegrations?: () => void
}

function formatDue(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}

function destinationLabel(
  result: CaptureNoteResult['destinations'],
  key: CaptureDestination
): string {
  const entry = result?.[key]
  if (!entry) return ''
  return entry.ok ? `${key} ✓` : `${key}: ${entry.error ?? 'failed'}`
}

type CaptureNoteResult = import('@shared/capture').CaptureNoteResult

export function NotesView({ onOpenIntegrations }: Props) {
  const [state, setState] = useState<CaptureState | null>(null)
  const [gmailAccounts, setGmailAccounts] = useState<{ id: string; email: string }[]>([])
  const [noteText, setNoteText] = useState('')
  const [noteTitle, setNoteTitle] = useState('')
  const [destFeed, setDestFeed] = useState(true)
  const [destObsidian, setDestObsidian] = useState(true)
  const [destGdocs, setDestGdocs] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [reminderText, setReminderText] = useState('')
  const [reminderDue, setReminderDue] = useState('')

  const activeProfile = useMemo(() => {
    if (!state) return null
    return state.profiles.find((p) => p.id === state.activeProfileId) ?? state.profiles[0] ?? null
  }, [state])

  const refresh = useCallback(async () => {
    const [capture, gmail] = await Promise.all([
      captureApi.state(),
      clusterApi.gmailAccounts().catch(() => ({ accounts: [] }))
    ])
    setState(capture)
    setGmailAccounts(gmail.accounts.map((a) => ({ id: a.id, email: a.email })))
  }, [])

  useEffect(() => {
    void refresh().catch((err) => setError(String(err)))
  }, [refresh])

  useEffect(() => {
    if (!toast) return
    const t = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(t)
  }, [toast])

  const saveProfiles = async (profiles: CaptureProfile[], activeProfileId?: string) => {
    const next = await captureApi.saveState({ profiles, activeProfileId })
    setState(next)
  }

  const [settingsDraft, setSettingsDraft] = useState<Partial<CaptureProfile>>({})

  useEffect(() => {
    if (activeProfile) {
      setSettingsDraft({
        obsidianVaultPath: activeProfile.obsidianVaultPath,
        obsidianNotePath: activeProfile.obsidianNotePath,
        gdocsDocumentId: activeProfile.gdocsDocumentId,
        gmailAccountId: activeProfile.gmailAccountId
      })
    }
  }, [activeProfile?.id, activeProfile?.obsidianVaultPath, activeProfile?.obsidianNotePath, activeProfile?.gdocsDocumentId, activeProfile?.gmailAccountId])

  const saveSettingsDraft = () => {
    if (!state || !activeProfile) return
    void saveProfiles(
      state.profiles.map((p) => (p.id === activeProfile.id ? { ...p, ...settingsDraft } : p)),
      state.activeProfileId
    )
  }

  const saveNote = async () => {
    const text = noteText.trim()
    if (!text || busy || !state) return
    setBusy(true)
    setError(null)
    const destinations: CaptureDestination[] = []
    if (destFeed) destinations.push('feed')
    if (destObsidian) destinations.push('obsidian')
    if (destGdocs) destinations.push('gdocs')

    try {
      const result = await captureApi.note({
        text,
        title: noteTitle.trim() || undefined,
        profileId: state.activeProfileId,
        destinations
      })
      const parts = (['feed', 'obsidian', 'gdocs'] as const)
        .map((k) => destinationLabel(result.destinations, k))
        .filter(Boolean)
      setToast(parts.length ? parts.join(' · ') : result.ok ? 'Saved' : 'Partial save')
      if (result.ok) {
        setNoteText('')
        setNoteTitle('')
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const addReminder = async () => {
    const text = reminderText.trim()
    if (!text || !reminderDue || !state) return
    try {
      const reminder = await captureApi.addReminder({
        text,
        dueAt: new Date(reminderDue).toISOString(),
        profileId: state.activeProfileId
      })
      setState({ ...state, reminders: [reminder, ...state.reminders] })
      setReminderText('')
      setReminderDue('')
      setToast('Reminder set')
    } catch (err) {
      setError(String(err))
    }
  }

  const toggleReminder = async (reminder: Reminder) => {
    const updated = await captureApi.updateReminder(reminder.id, { done: !reminder.done })
    if (!state) return
    setState({
      ...state,
      reminders: state.reminders.map((r) => (r.id === updated.id ? updated : r))
    })
  }

  const removeReminder = async (id: string) => {
    await captureApi.deleteReminder(id)
    if (!state) return
    setState({ ...state, reminders: state.reminders.filter((r) => r.id !== id) })
  }

  const upcomingReminders = useMemo(() => {
    if (!state) return []
    return [...state.reminders]
      .filter((r) => r.profileId === state.activeProfileId)
      .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
  }, [state])

  if (!state || !activeProfile) {
    return (
      <div className="x-notes x-notes-loading">
        <p>Loading capture…</p>
      </div>
    )
  }

  return (
    <div className="x-notes">
      <header className="x-notes-head">
        <div>
          <p className="x-notes-eyebrow">Capture</p>
          <h1 className="x-notes-title">Notes & reminders</h1>
          <p className="x-notes-sub">
            Append to Obsidian vaults and Google Docs — personal and business profiles share the same
            Notch session across desktop and mobile.
          </p>
        </div>
        <div className="x-notes-profile-tabs" role="tablist" aria-label="Workspace profile">
          {state.profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              role="tab"
              aria-selected={p.id === state.activeProfileId}
              className={`x-notes-profile-tab ${p.id === state.activeProfileId ? 'active' : ''}`}
              onClick={() => void saveProfiles(state.profiles, p.id)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </header>

      {toast ? <p className="x-notes-toast">{toast}</p> : null}
      {error ? <p className="x-notes-error">{error}</p> : null}

      <div className="x-notes-grid">
        <section className="x-notes-compose">
          <label className="x-notes-label" htmlFor="note-title">
            Title <span className="x-notes-optional">optional</span>
          </label>
          <input
            id="note-title"
            className="x-notes-input"
            value={noteTitle}
            onChange={(e) => setNoteTitle(e.target.value)}
            placeholder="Standup notes, idea, follow-up…"
          />

          <label className="x-notes-label" htmlFor="note-body">
            Note
          </label>
          <textarea
            id="note-body"
            className="x-notes-textarea"
            rows={10}
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Write freely — saves to your chosen destinations for this profile."
          />

          <div className="x-notes-dest-row">
            <span className="x-notes-label">Send to</span>
            <label className="x-notes-check">
              <input type="checkbox" checked={destFeed} onChange={(e) => setDestFeed(e.target.checked)} />
              Feed
            </label>
            <label className="x-notes-check">
              <input
                type="checkbox"
                checked={destObsidian}
                onChange={(e) => setDestObsidian(e.target.checked)}
              />
              Obsidian
            </label>
            <label className="x-notes-check">
              <input type="checkbox" checked={destGdocs} onChange={(e) => setDestGdocs(e.target.checked)} />
              Google Doc
            </label>
          </div>

          <button type="button" className="x-notes-save" disabled={busy || !noteText.trim()} onClick={() => void saveNote()}>
            {busy ? 'Saving…' : 'Save note'}
          </button>
        </section>

        <aside className="x-notes-side">
          <section className="x-notes-reminders">
            <h2 className="x-notes-section-title">Reminders</h2>
            <div className="x-notes-reminder-form">
              <input
                className="x-notes-input"
                value={reminderText}
                onChange={(e) => setReminderText(e.target.value)}
                placeholder="What to remember"
              />
              <input
                type="datetime-local"
                className="x-notes-input"
                value={reminderDue}
                onChange={(e) => setReminderDue(e.target.value)}
              />
              <button
                type="button"
                className="x-notes-btn-secondary"
                disabled={!reminderText.trim() || !reminderDue}
                onClick={() => void addReminder()}
              >
                Add reminder
              </button>
            </div>
            <ul className="x-notes-reminder-list">
              {upcomingReminders.length === 0 ? (
                <li className="x-notes-empty">No reminders for {activeProfile.label}</li>
              ) : (
                upcomingReminders.map((r) => (
                  <li key={r.id} className={`x-notes-reminder ${r.done ? 'done' : ''}`}>
                    <label className="x-notes-reminder-main">
                      <input type="checkbox" checked={r.done} onChange={() => void toggleReminder(r)} />
                      <span>{r.text}</span>
                    </label>
                    <span className="x-notes-reminder-due">{formatDue(r.dueAt)}</span>
                    <button type="button" className="x-notes-reminder-del" onClick={() => void removeReminder(r.id)}>
                      ×
                    </button>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="x-notes-settings">
            <button
              type="button"
              className="x-notes-settings-toggle"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((v) => !v)}
            >
              {activeProfile.label} destinations {settingsOpen ? '▾' : '▸'}
            </button>
            {settingsOpen ? (
              <div className="x-notes-settings-body">
                <label className="x-notes-label" htmlFor="vault-path">
                  Obsidian vault path
                </label>
                <input
                  id="vault-path"
                  className="x-notes-input"
                  value={settingsDraft.obsidianVaultPath ?? ''}
                  onChange={(e) => setSettingsDraft((d) => ({ ...d, obsidianVaultPath: e.target.value }))}
                  onBlur={saveSettingsDraft}
                  placeholder="/Users/you/Obsidian/Personal"
                />
                <label className="x-notes-label" htmlFor="note-path">
                  Note path in vault
                </label>
                <input
                  id="note-path"
                  className="x-notes-input"
                  value={settingsDraft.obsidianNotePath ?? ''}
                  onChange={(e) => setSettingsDraft((d) => ({ ...d, obsidianNotePath: e.target.value }))}
                  onBlur={saveSettingsDraft}
                  placeholder="Daily Notes/{{date}}.md"
                />
                <label className="x-notes-label" htmlFor="gdocs-id">
                  Google Doc id
                </label>
                <input
                  id="gdocs-id"
                  className="x-notes-input"
                  value={settingsDraft.gdocsDocumentId ?? ''}
                  onChange={(e) => setSettingsDraft((d) => ({ ...d, gdocsDocumentId: e.target.value }))}
                  onBlur={saveSettingsDraft}
                  placeholder="From docs.google.com/document/d/DOC_ID/edit"
                />
                <label className="x-notes-label" htmlFor="gmail-acct">
                  Gmail account for Docs
                </label>
                <select
                  id="gmail-acct"
                  className="x-notes-input"
                  value={settingsDraft.gmailAccountId ?? ''}
                  onChange={(e) => {
                    setSettingsDraft((d) => ({ ...d, gmailAccountId: e.target.value || undefined }))
                    setTimeout(saveSettingsDraft, 0)
                  }}
                >
                  <option value="">First connected account</option>
                  {gmailAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.email}
                    </option>
                  ))}
                </select>
                {gmailAccounts.length === 0 ? (
                  <button type="button" className="x-notes-link" onClick={onOpenIntegrations}>
                    Connect Gmail in Apps →
                  </button>
                ) : null}
                <p className="x-notes-hint">
                  Use separate vault paths and doc ids per profile — e.g. personal vs business Obsidian.
                </p>
              </div>
            ) : null}
          </section>
        </aside>
      </div>
    </div>
  )
}
