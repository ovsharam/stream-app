const ACTIVITY = [
  { time: '2m', text: 'Gmail sync — 3 threads ingested to graph', source: 'gmail' },
  { time: '8m', text: 'Slack #acme-deal — Sarah Kim confirmed budget ceiling', source: 'slack' },
  { time: '15m', text: 'Salesforce opportunity stage updated → Technical Eval', source: 'salesforce' },
  { time: '22m', text: 'Gong call recording linked to Acme discovery', source: 'gong' },
  { time: '1h', text: 'Mobile assist used — GDPR Art. 46 response generated', source: 'notch' }
]

export function ActivityPanel() {
  return (
    <div className="max-w-2xl rounded-xl border border-neutral-200 bg-white p-5">
      <h2 className="text-sm font-semibold">Activity stream</h2>
      <p className="mt-1 text-xs text-neutral-500">Slack, Salesforce, Gmail, and mobile cluster events</p>
      <div className="mt-4 space-y-3">
        {ACTIVITY.map((a) => (
          <div key={a.text} className="flex gap-3 border-b border-neutral-50 pb-3 last:border-0">
            <span className="shrink-0 font-mono text-[10px] text-neutral-400">{a.time}</span>
            <div>
              <p className="text-xs text-neutral-800">{a.text}</p>
              <p className="text-[10px] capitalize text-neutral-400">{a.source}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
