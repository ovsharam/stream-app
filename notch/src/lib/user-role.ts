export type UserRole = 'ae' | 'am' | 'csm' | 'fde'

const KEY = 'stream.user.role'

export function getUserRole(): UserRole {
  const raw = localStorage.getItem(KEY)
  if (raw === 'ae' || raw === 'am' || raw === 'csm' || raw === 'fde') return raw
  return 'ae'
}

export function setUserRole(role: UserRole): void {
  localStorage.setItem(KEY, role)
  window.dispatchEvent(new CustomEvent('stream:user-role', { detail: role }))
}
