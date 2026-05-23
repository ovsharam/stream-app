import type { DealContact } from '../../simulation/types'

const ROLE_LABELS: Record<string, string> = {
  champion: 'Champion',
  economic_buyer: 'Economic buyer',
  technical_evaluator: 'Technical eval'
}

type Props = { contact: DealContact }

export function AttendeeCard({ contact }: Props) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-white/85">{contact.name}</span>
        <span className="font-mono text-[9px] text-[#AFA9EC]">{ROLE_LABELS[contact.role] ?? contact.role}</span>
      </div>
      <p className="mt-0.5 text-[10px] text-white/40">{contact.title}</p>
      <p className="mt-1.5 text-[10px] text-white/50">{contact.last_interaction}</p>
      <p className="mt-1 text-[10px] leading-snug text-white/35">{contact.notes}</p>
    </div>
  )
}
