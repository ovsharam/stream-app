'use client'

/**
 * Legacy browser route — Notch runs as native Electron desktop apps, not here.
 * See notch/README.md
 */
export default function DashboardRedirect() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-6 text-center text-[#0f1419]">
      <div className="max-w-md space-y-6">
        <p className="text-4xl font-bold">N</p>
        <h1 className="text-2xl font-bold">Notch is a desktop app</h1>
        <p className="text-[15px] leading-relaxed text-[#536471]">
          Central cluster and mobile cluster are <strong>Electron windows</strong>, not this browser
          page. Close this tab and run:
        </p>
        <pre className="rounded-xl bg-[#f7f9f9] px-4 py-3 text-left text-sm font-mono">
          npm run dev:notch
        </pre>
        <ul className="space-y-3 text-left text-sm text-[#536471]">
          <li>
            <strong className="text-[#0f1419]">Central cluster</strong> — large white window titled
            &quot;Notch&quot; (X-style stream)
          </li>
          <li>
            <strong className="text-[#0f1419]">Mobile cluster</strong> — hidden until{' '}
            <kbd className="rounded bg-[#eff3f4] px-1.5 py-0.5 font-mono text-xs">⌘⇧M</kbd>
            · stays in menu bar if central is closed
          </li>
          <li>
            <strong className="text-[#0f1419]">Menu bar</strong> — blue Notch icon in the macOS menu
            bar → &quot;Central stream&quot; or &quot;Mobile assist&quot;
          </li>
        </ul>
        <p className="text-xs text-[#536471]">
          Dev URLs (loaded by Electron only):{' '}
          <code className="text-[#0f1419]">localhost:5174/central.html</code> and{' '}
          <code className="text-[#0f1419]">localhost:5174/</code>
        </p>
      </div>
    </div>
  )
}
