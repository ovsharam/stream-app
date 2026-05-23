export default function OfflinePage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-stream-bg p-6 text-center">
      <div>
        <p className="font-mono text-sm text-stream-primary">STREAM</p>
        <p className="mt-2 font-sans text-sm text-stream-secondary">
          You&apos;re offline. Cached stream items may still be available.
        </p>
      </div>
    </div>
  )
}
