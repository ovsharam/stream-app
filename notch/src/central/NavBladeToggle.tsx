type Props = {
  open: boolean
  onToggle: () => void
}

export function NavBladeToggle({ open, onToggle }: Props) {
  return (
    <button
      type="button"
      className={`x-nav-blade-toggle${open ? ' x-nav-blade-toggle-open' : ''}`}
      aria-label={open ? 'Close navigation' : 'Open navigation'}
      aria-expanded={open}
      title={open ? 'Close navigation' : 'Open navigation'}
      onClick={onToggle}
    >
      {open ? '◨' : '☰'}
    </button>
  )
}

function readNavOpen(): boolean {
  try {
    const stored = localStorage.getItem('notch.navOpen')
    if (stored === '0') return false
    if (stored === '1') return true
    const legacy = localStorage.getItem('notch.navMode')
    if (legacy === 'hidden' || legacy === 'compact') return false
    if (legacy === 'expanded') return true
  } catch {
    /* ignore */
  }
  return true
}

export function persistNavOpen(open: boolean): void {
  try {
    localStorage.setItem('notch.navOpen', open ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export { readNavOpen }
