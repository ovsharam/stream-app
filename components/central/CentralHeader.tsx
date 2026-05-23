'use client'

type Props = { live: boolean; deal: string }

export function CentralHeader({ live, deal }: Props) {
  return (
    <header className="central-header flex shrink-0 items-center justify-between px-5 py-3.5">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-neutral-900 text-[13px] font-semibold text-white">
          N
        </div>
        <div>
          <h1 className="text-[15px] font-semibold tracking-[-0.02em] text-neutral-900">Notch</h1>
          <p className="text-[11px] text-neutral-500">{deal}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {live && (
          <span className="flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50 px-2.5 py-1 text-[10px] font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            Live stream
          </span>
        )}
        <span className="rounded-full border border-black/[0.06] bg-white px-2.5 py-1 text-[10px] font-medium text-neutral-500">
          Droplet · ⌘⇧Space
        </span>
      </div>
    </header>
  )
}
