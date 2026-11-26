import { useContext } from 'react'
import { SessionContext, type SessionContextValue } from '@/features/auth/session-context'

/**
 * Read the current session. Must be used inside a `<SessionProvider>` — the
 * provider resolves the session before rendering children, so `loading` is
 * always `false` here.
 */
export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider')
  }
  return ctx
}
