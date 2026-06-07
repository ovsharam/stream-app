import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Scope Measure — Applied Scope',
  description:
    'Live ops console for telemetry, FDE training corpus, meeting moments, and knowledge graph — separate from the Notch desktop app.'
}

export default function MeasureLayout({ children }: { children: React.ReactNode }) {
  return children
}
