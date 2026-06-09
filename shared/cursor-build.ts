export type CursorBuildMode = 'local' | 'cloud'

export type CursorLocalProject = {
  id: string
  name: string
  path: string
  addedAt: string
}

export type CursorBuildStatus = {
  hasApiKey: boolean
  ready: boolean
  mode: CursorBuildMode
  accountEmail?: string
  accountName?: string
  repo?: string
  localProjects: CursorLocalProject[]
  activeLocalProjectId?: string
  cloudRepos?: Array<{ url: string; name: string }>
}
