'use client'

import { signOut, useSession } from 'next-auth/react'

export function UserMenu() {
  const { data: session } = useSession()
  const email = session?.user?.email

  if (!email) return null

  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-[160px] truncate text-xs text-zinc-500 sm:inline" title={email}>
        {email}
      </span>
      <button
        type="button"
        onClick={() => void signOut({ callbackUrl: '/login' })}
        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900"
      >
        Sign out
      </button>
    </div>
  )
}
