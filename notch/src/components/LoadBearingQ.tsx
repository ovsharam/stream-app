type Props = {
  content: string
  urgency: 'high' | 'medium' | 'low'
}

export function LoadBearingQ({ content, urgency }: Props) {
  const urgent = urgency === 'high'
  return (
    <div
      className={`rounded-r-lg border-l-2 px-3 py-2 ${
        urgent ? 'border-[#E24B4A] bg-[#E24B4A]/5' : 'border-[#EF9F27] bg-[#BA7517]/5'
      }`}
    >
      <p className="text-xs text-white/75">{content}</p>
      {urgent && <p className="mt-1 font-mono text-[9px] text-[#F09595]">Will stall deal if not closed today</p>}
    </div>
  )
}
