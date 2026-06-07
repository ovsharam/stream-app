import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Scope Measure — Applied Scope',
  description:
    'Live ops console for telemetry, FDE training corpus, meeting moments, and behavioral intention — hosted at appliedscope.com.'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
