import { useCallback, useEffect, useState } from 'react'

export type ThemeId = 'light' | 'dark' | 'gray' | 'midnight'

const STORAGE_KEY = 'notch-central-theme'

export const THEMES: { id: ThemeId; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'gray', label: 'Gray' },
  { id: 'midnight', label: 'Midnight' }
]

function readStored(): ThemeId {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as ThemeId | null
    if (v && THEMES.some((t) => t.id === v)) return v
  } catch {
    /* ignore */
  }
  return 'dark'
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(readStored)

  const setTheme = useCallback((id: ThemeId) => {
    setThemeState(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  return { theme, setTheme }
}
