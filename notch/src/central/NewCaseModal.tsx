import { useState } from 'react'
import type { EngagementStage, ScopeBucket } from '@shared/fde-engagement'

type Props = {
  open: boolean
  busy?: boolean
  onClose: () => void
  onCreate: (input: {
    clientName: string
    company?: string
    summary?: string
  }) => void | Promise<void>
}

export function NewCaseModal({ open, busy, onClose, onCreate }: Props) {
  const [clientName, setClientName] = useState('')
  const [company, setCompany] = useState('')
  const [summary, setSummary] = useState('')

  if (!open) return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const name = clientName.trim()
    if (!name) return
    void onCreate({
      clientName: name,
      company: company.trim() || undefined,
      summary: summary.trim() || undefined
    })
    setClientName('')
    setCompany('')
    setSummary('')
  }

  return (
    <div className="x-modal-backdrop" role="presentation" onClick={onClose}>
      <form
        className="x-modal x-modal-case"
        role="dialog"
        aria-labelledby="new-case-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
      >
        <header className="x-modal-head">
          <h2 id="new-case-title">New engagement</h2>
          <p>Create a client case — meetings, channels, and builds link here automatically.</p>
        </header>
        <div className="x-modal-body">
          <label className="x-form-field">
            <span>Client name</span>
            <input
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Acme Corp"
              required
              autoFocus
            />
          </label>
          <label className="x-form-field">
            <span>Company / segment</span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Enterprise · Health · etc."
            />
          </label>
          <label className="x-form-field">
            <span>Initial scope note</span>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="What are we building? Who is the buyer?"
              rows={3}
            />
          </label>
        </div>
        <footer className="x-modal-foot">
          <button type="button" className="x-btn x-btn-muted" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="x-btn x-btn-primary" disabled={busy || !clientName.trim()}>
            {busy ? 'Creating…' : 'Create case'}
          </button>
        </footer>
      </form>
    </div>
  )
}

export type { EngagementStage, ScopeBucket }
