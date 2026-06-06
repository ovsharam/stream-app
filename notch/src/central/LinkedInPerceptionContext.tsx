import { createContext, useContext, type ReactNode } from 'react'

const LinkedInPerceptionContext = createContext(false)

export function LinkedInPerceptionProvider({
  backgroundActive,
  children
}: {
  backgroundActive: boolean
  children: ReactNode
}) {
  return (
    <LinkedInPerceptionContext.Provider value={backgroundActive}>
      {children}
    </LinkedInPerceptionContext.Provider>
  )
}

export function useLinkedInPerceptionBackground(): boolean {
  return useContext(LinkedInPerceptionContext)
}
