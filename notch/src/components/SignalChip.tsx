const STYLES: Record<string, { bg: string; text: string }> = {
  blocker: { bg: 'rgba(226,75,74,0.12)', text: '#F09595' },
  risk: { bg: 'rgba(226,75,74,0.12)', text: '#F09595' },
  budget: { bg: 'rgba(99,153,34,0.12)', text: '#97C459' },
  champion: { bg: 'rgba(127,119,221,0.12)', text: '#AFA9EC' },
  timeline: { bg: 'rgba(186,117,23,0.12)', text: '#EF9F27' },
  technical: { bg: 'rgba(55,138,221,0.12)', text: '#85B7EB' },
  motion: { bg: 'rgba(55,138,221,0.12)', text: '#85B7EB' }
}

type Props = { type: string; content: string }

export function SignalChip({ type, content }: Props) {
  const style = STYLES[type] ?? STYLES.motion
  return (
    <span
      className="inline-block max-w-full truncate rounded-full px-2 py-0.5 font-mono text-[10px]"
      style={{ backgroundColor: style.bg, color: style.text }}
    >
      {content}
    </span>
  )
}
