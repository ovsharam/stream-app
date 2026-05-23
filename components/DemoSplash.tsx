'use client'

export function DemoSplash() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-stream-bg px-6">
      <div className="relative">
        <span className="absolute -inset-4 animate-ping rounded-full bg-stream-perplexity/20" />
        <span className="relative flex h-14 w-14 items-center justify-center rounded-full border border-stream-perplexity/40 bg-stream-surface font-mono text-lg text-stream-perplexity">
          S
        </span>
      </div>
      <p className="mt-8 font-mono text-sm tracking-widest text-stream-primary">STREAM</p>
      <p className="mt-2 font-mono text-xs text-stream-secondary">Connecting signal sources…</p>
      <div className="mt-6 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-stream-perplexity demo-dot"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  )
}
