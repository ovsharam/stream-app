export type ThemeMode = 'light' | 'dark'

export type ThemeId =
  | 'light'
  | 'rose'
  | 'slate'
  | 'sepia'
  | 'dark'
  | 'gray'
  | 'midnight'
  | 'ocean'
  | 'forest'
  | 'obsidian'
  | 'ember'

export type ThemeDefinition = {
  id: ThemeId
  label: string
  mode: ThemeMode
  hint?: string
  /** Electron BrowserView chrome color */
  shellBg: string
}

export const THEMES: ThemeDefinition[] = [
  { id: 'light', label: 'Light', mode: 'light', hint: 'Warm paper', shellBg: '#faf9f5' },
  { id: 'rose', label: 'Rose', mode: 'light', hint: 'Soft blush', shellBg: '#fdf8f7' },
  { id: 'slate', label: 'Slate', mode: 'light', hint: 'Cool studio', shellBg: '#f4f6f8' },
  { id: 'sepia', label: 'Sepia', mode: 'light', hint: 'Reading mode', shellBg: '#f3ead8' },
  { id: 'dark', label: 'Dark', mode: 'dark', hint: 'Default', shellBg: '#181715' },
  { id: 'gray', label: 'Gray', mode: 'dark', hint: 'Muted UI', shellBg: '#1f1e1b' },
  { id: 'midnight', label: 'Midnight', mode: 'dark', hint: 'Deep focus', shellBg: '#141312' },
  { id: 'ocean', label: 'Ocean', mode: 'dark', hint: 'Cool blue', shellBg: '#0f1419' },
  { id: 'forest', label: 'Forest', mode: 'dark', hint: 'Deep green', shellBg: '#0f1410' },
  { id: 'ember', label: 'Ember', mode: 'dark', hint: 'Warm copper', shellBg: '#1a1512' },
  { id: 'obsidian', label: 'Obsidian', mode: 'dark', hint: 'OLED black', shellBg: '#000000' }
]

export const THEME_BY_ID: Record<ThemeId, ThemeDefinition> = Object.fromEntries(
  THEMES.map((t) => [t.id, t])
) as Record<ThemeId, ThemeDefinition>

export const THEME_GROUPS: { label: string; themes: ThemeDefinition[] }[] = [
  { label: 'Light', themes: THEMES.filter((t) => t.mode === 'light') },
  { label: 'Dark', themes: THEMES.filter((t) => t.mode === 'dark') }
]

export function isThemeId(value: string): value is ThemeId {
  return value in THEME_BY_ID
}

export function themeMode(id: ThemeId): ThemeMode {
  return THEME_BY_ID[id]?.mode ?? 'dark'
}

export function themeShellBg(id: ThemeId): string {
  return THEME_BY_ID[id]?.shellBg ?? THEME_BY_ID.dark.shellBg
}
