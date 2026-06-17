import { useCallback, useEffect, useState } from 'react'
import {
  isThemeId,
  themeMode,
  THEMES,
  type ThemeId
} from './themes'

export type { ThemeId } from './themes'
export { THEMES, THEME_GROUPS } from './themes'

const STORAGE_KEY = 'notch-central-theme'

export function readStoredTheme(): ThemeId {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v && isThemeId(v)) return v
  } catch {
    /* ignore */
  }
  return 'dark'
}

export function applyThemeToDocument(theme: ThemeId): void {
  document.documentElement.dataset.theme = theme
  document.documentElement.dataset.themeMode = themeMode(theme)
}

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeId>(readStoredTheme)

  const setTheme = useCallback((id: ThemeId) => {
    setThemeState(id)
    try {
      localStorage.setItem(STORAGE_KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    applyThemeToDocument(theme)
  }, [theme])

  return { theme, setTheme }
}
