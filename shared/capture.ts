/** Quick capture: notes, reminders, and multi-profile destinations (Obsidian + GDocs). */

export type CaptureProfile = {
  id: string
  label: string
  /** Absolute path to Obsidian vault root on this machine. */
  obsidianVaultPath?: string
  /** Relative path inside vault; supports {{date}} → YYYY-MM-DD. */
  obsidianNotePath?: string
  /** Google Doc id to append notes into. */
  gdocsDocumentId?: string
  /** Gmail account id (from connected accounts) for GDocs writes. */
  gmailAccountId?: string
}

export type Reminder = {
  id: string
  profileId: string
  text: string
  dueAt: string
  createdAt: string
  done: boolean
}

export type CaptureState = {
  profiles: CaptureProfile[]
  activeProfileId: string
  reminders: Reminder[]
}

export type CaptureDestination = 'feed' | 'obsidian' | 'gdocs'

export type CaptureNoteResult = {
  ok: boolean
  profileId: string
  destinations: Partial<Record<CaptureDestination, { ok: boolean; error?: string }>>
  feedItemId?: string
}

export const DEFAULT_CAPTURE_PROFILES: CaptureProfile[] = [
  {
    id: 'personal',
    label: 'Personal',
    obsidianNotePath: 'Daily Notes/{{date}}.md'
  },
  {
    id: 'business',
    label: 'Business',
    obsidianNotePath: 'Work/{{date}}.md'
  }
]

export function resolveObsidianNotePath(template: string, date = new Date()): string {
  const iso = date.toISOString().slice(0, 10)
  return template.replace(/\{\{date\}\}/g, iso)
}
