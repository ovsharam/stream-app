'use client'

import { useState } from 'react'
import { clusterApi } from '@/lib/cluster-api'

export function CentralComposer() {
  const [q, setQ] = useState('')
  const [answer, setAnswer] = useState<string | null>(null)

  const submit = async () => {
    if (!q.trim()) return
    const r = await clusterApi.assist(q)
    setAnswer(r.sayThis)
    setQ('')
  }

  return (
    <div className="central-composer shrink-0 px-4 pb-5 pt-2">
      <div className="mx-auto max-w-[540px]">
        {answer && (
          <div className="mb-3 rounded-2xl border border-black/[0.06] bg-white px-4 py-3 shadow-sm">
            <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">From shared context</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-700">{answer}</p>
          </div>
        )}
        <div className="flex items-end gap-2 rounded-2xl border border-black/[0.08] bg-white p-2 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_12px_rgba(0,0,0,0.03)]">
          <textarea
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
            rows={1}
            placeholder="Filter stream, ask about a deal, draft a follow-up…"
            className="max-h-32 min-h-[40px] flex-1 resize-none bg-transparent px-2 py-2 text-[14px] text-neutral-900 placeholder:text-neutral-400 outline-none"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!q.trim()}
            className="mb-0.5 rounded-xl bg-neutral-900 px-3.5 py-2 text-[13px] font-medium text-white disabled:opacity-30"
          >
            Send
          </button>
        </div>
        <p className="mt-2 text-center text-[10px] text-neutral-400">
          Central cluster · same graph as mobile droplet
        </p>
      </div>
    </div>
  )
}
