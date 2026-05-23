type Props = {
  text: string
  checked?: boolean
  onToggle?: () => void
}

export function TalkingPoint({ text, checked, onToggle }: Props) {
  return (
    <label className="flex cursor-pointer gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
      {onToggle && (
        <input
          type="checkbox"
          checked={!!checked}
          onChange={onToggle}
          className="mt-0.5 shrink-0 accent-[#85B7EB]"
        />
      )}
      <span className={`text-xs leading-relaxed ${checked ? 'text-white/35 line-through' : 'text-white/70'}`}>
        {text}
      </span>
    </label>
  )
}
