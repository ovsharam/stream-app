import './ambient.css'

export default function AmbientLayout({ children }: { children: React.ReactNode }) {
  return <div className="ambient-body min-h-screen bg-transparent">{children}</div>
}
