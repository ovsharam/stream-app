import { useEffect, useState } from 'react'

type Props = { onClose: () => void }

const MOCK_RESULTS = [
  { title: 'EU data residency pattern', sub: '3 deals · NovaBank resolved in 48h' },
  { title: 'Redwood HQ reference', sub: 'Closed won · similar scale · CISO Dana Chen' },
  { title: 'SCC template', sub: 'Google Drive · pre-signed addendum' },
  { title: 'Sarah Kim — last email', sub: 'Budget confirmed · 1 day ago' }
]

export function SearchPanel({ onClose }: Props) {
  const [q, setQ] = useState('')

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const filtered = MOCK_RESULTS.filter(
    (r) => !q || r.title.toLowerCase().includes(q.toLowerCase()) || r.sub.toLowerCase().includes(q.toLowerCase())
  )

  return (
    <div className="absolute inset-0 z-10 flex flex-col rounded-[14px] bg-[rgba(16,16,20,0.96)] backdrop-blur-xl">
      <div className="border-b border-white/10 px-4 py-3">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search graph…"
          className="w-full bg-transparent text-sm text-white/85 outline-none placeholder:text-white/25"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.map((r) => (
          <button
            key={r.title}
            type="button"
            className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-white/5"
          >
            <p className="text-xs text-white/80">{r.title}</p>
            <p className="text-[10px] text-white/35">{r.sub}</p>
          </button>
        ))}
      </div>
      <button type="button" onClick={onClose} className="border-t border-white/10 py-2 text-[10px] text-white/35">
        esc to close
      </button>
    </div>
  )
}
