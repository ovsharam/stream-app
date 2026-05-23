type Props = {
  question: string
  response: string
  sources: string[]
}

export function LiveAnswer({ question, response, sources }: Props) {
  return (
    <div className="live-answer-enter rounded-lg border border-[#378ADD]/20 bg-[#378ADD]/[0.07] p-3">
      <p className="text-[10px] uppercase tracking-wider text-[#85B7EB]/70">Live assist</p>
      <p className="mt-1 text-[10px] text-white/40">{question}</p>
      <p className="mt-2 text-xs leading-relaxed text-white/85">{response}</p>
      {sources.length > 0 && (
        <p className="mt-2 font-mono text-[9px] text-white/25">{sources.join(' · ')}</p>
      )}
    </div>
  )
}
