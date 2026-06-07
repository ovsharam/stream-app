import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Download Notch — Applied Scope',
  description: 'Download Notch for macOS — your FDE work OS with unified feed, meeting capture, and integrations.'
}

const MAC_URL =
  process.env.NEXT_PUBLIC_NOTCH_DOWNLOAD_MAC?.trim() ||
  process.env.NOTCH_DOWNLOAD_MAC?.trim() ||
  ''

export default function DownloadPage() {
  const hasMacBuild = MAC_URL.length > 0 && MAC_URL.startsWith('http')

  return (
    <div className="min-h-[100dvh] bg-[#0f0e0c] text-[#e8e4dc]">
      <div className="mx-auto flex max-w-2xl flex-col px-6 py-16 sm:py-24">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[#8a8578]">Applied Scope</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-white sm:text-5xl">Notch</h1>
        <p className="mt-4 text-lg leading-relaxed text-[#b8b2a6]">
          Desktop work OS for FDEs and enterprise operators — unified signal feed, meeting capture,
          integrations, and knowledge graph in one app.
        </p>

        <div className="mt-12 rounded-2xl border border-[#2a2824] bg-[#181715] p-8">
          <h2 className="text-sm font-medium uppercase tracking-wide text-[#8a8578]">macOS</h2>
          <p className="mt-2 text-sm text-[#b8b2a6]">
            Apple Silicon and Intel · macOS 13+
          </p>

          {hasMacBuild ? (
            <a
              href={MAC_URL}
              className="mt-6 inline-flex items-center justify-center rounded-xl bg-[#e8e4dc] px-6 py-3 text-sm font-semibold text-[#0f0e0c] transition hover:bg-white"
              download
            >
              Download for Mac
            </a>
          ) : (
            <p className="mt-6 rounded-lg border border-dashed border-[#3a3834] px-4 py-3 font-mono text-sm text-[#8a8578]">
              Mac build URL not configured. Set{' '}
              <code className="text-[#c4beb2]">NEXT_PUBLIC_NOTCH_DOWNLOAD_MAC</code> to your hosted
              .dmg or .zip.
            </p>
          )}

          <ol className="mt-8 list-decimal space-y-2 pl-5 text-sm text-[#8a8578]">
            <li>Open the downloaded disk image and drag Notch to Applications.</li>
            <li>On first launch, macOS may ask you to allow the app (Right-click → Open if needed).</li>
            <li>Connect integrations from the Apps panel inside Notch.</li>
          </ol>
        </div>

        <p className="mt-10 text-center text-sm text-[#6a655c]">
          <Link href="/" className="underline decoration-[#3a3834] underline-offset-4 hover:text-[#b8b2a6]">
            ← Back to site
          </Link>
        </p>
      </div>
    </div>
  )
}
