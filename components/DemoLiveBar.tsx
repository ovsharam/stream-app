'use client'

import { useStreamStore } from '@/store/streamStore'

export function DemoLiveBar() {
  const demoPaused = useStreamStore((s) => s.demoPaused)
  const demoSpeed = useStreamStore((s) => s.demoSpeed)
  const setDemoPaused = useStreamStore((s) => s.setDemoPaused)
  const setDemoSpeed = useStreamStore((s) => s.setDemoSpeed)

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-stream-border bg-stream-surface/90 px-3 py-1.5 backdrop-blur-sm">
      <div className="flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          {!demoPaused && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${demoPaused ? 'bg-stream-secondary' : 'bg-red-500'}`}
          />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-stream-secondary">
          {demoPaused ? 'Demo paused' : 'Live demo'}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setDemoPaused(!demoPaused)}
          className="rounded border border-stream-border px-2 py-0.5 font-mono text-[10px] text-stream-primary hover:bg-stream-border"
        >
          {demoPaused ? 'Resume' : 'Pause'}
        </button>
        {([1, 2, 3] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setDemoSpeed(s)}
            className={`rounded px-1.5 py-0.5 font-mono text-[10px] ${
              demoSpeed === s
                ? 'bg-stream-perplexity text-stream-bg'
                : 'text-stream-secondary hover:text-stream-primary'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  )
}
