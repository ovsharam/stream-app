import { useEffect, useState } from 'react'
import { clusterApi } from '../lib/api'
import { getUserRole, type UserRole } from '../lib/user-role'

const ROLE_LABEL: Record<UserRole, string> = {
  fde: 'Forward Deployed Engineer',
  ae: 'Account Executive',
  am: 'Account Manager',
  csm: 'Customer Success'
}

export type OperatorProfile = {
  displayName: string
  handle: string
  roleLabel: string
  initial: string
}

function profileFromEmail(email: string, role: UserRole): OperatorProfile {
  const local = email.split('@')[0] ?? 'operator'
  const displayName = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
  const handle = email.includes('@') ? `@${email.split('@')[1]?.split('.')[0] ?? 'workspace'}` : '@workspace'
  return {
    displayName: displayName || 'Operator',
    handle,
    roleLabel: ROLE_LABEL[role],
    initial: (displayName.charAt(0) || 'O').toUpperCase()
  }
}

export function useOperatorProfile(): OperatorProfile {
  const [profile, setProfile] = useState<OperatorProfile>(() => {
    const role = getUserRole()
    return {
      displayName: 'Operator',
      handle: `@${role}`,
      roleLabel: ROLE_LABEL[role],
      initial: 'O'
    }
  })

  useEffect(() => {
    let cancelled = false

    const applyRole = () => {
      const role = getUserRole()
      setProfile((prev) => ({
        ...prev,
        handle: prev.handle.startsWith('@') && prev.displayName === 'Operator' ? `@${role}` : prev.handle,
        roleLabel: ROLE_LABEL[role]
      }))
    }

    void clusterApi
      .gmailAccounts()
      .then((data) => {
        if (cancelled) return
        const email = data.accounts?.[0]?.email?.trim()
        if (email) setProfile(profileFromEmail(email, getUserRole()))
        else applyRole()
      })
      .catch(() => {
        if (!cancelled) applyRole()
      })

    const onRole = () => applyRole()
    window.addEventListener('stream:user-role', onRole)
    return () => {
      cancelled = true
      window.removeEventListener('stream:user-role', onRole)
    }
  }, [])

  return profile
}
