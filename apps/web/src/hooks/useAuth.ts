import { useMemo } from 'react'
import type { AuthOutcome } from '@bellum/contracts'
import { sessionManager } from '@/features/auth/session-manager'
import { useSession } from '@/lib/hooks/use-session'

type AuthContext = {
  user: ReturnType<typeof useSession>['user']
  session: { user: NonNullable<ReturnType<typeof useSession>['user']> } | null
  loading: ReturnType<typeof useSession>['loading']
  /**
   * Both `signIn` and `signUp` resolve to an `AuthOutcome` discriminated
   * union. Routing to `/verify-email` vs `/onboarding` is the caller's
   * responsibility — no exception is thrown on the pending branch.
   */
  signIn: (email: string, password: string) => Promise<AuthOutcome>
  signUp: (email: string, password: string, firstName: string, lastName?: string) => Promise<AuthOutcome>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
}
/**
 * Back-compat adapter that mirrors the pre-migration `useAuth()` shape (so
 * existing pages keep working) while delegating to the new session layer.
 *
 * Auth tokens now live in HttpOnly cookies, never in JS. `session` is
 * derived from the user payload only and kept stable across renders so
 * consumers using it in `useEffect` deps don't fire spuriously.
 */
export function useAuth(): AuthContext {
  const { user, loading } = useSession()
  const session = useMemo(() => (user ? ({ user } as const) : null), [user])
  return {
    user,
    session,
    loading,
    signIn: (email: string, password: string) => sessionManager.login(email, password),
    signUp: (email: string, password: string, firstName: string, lastName?: string) =>
      sessionManager.signup(email, password, firstName, lastName),
    signInWithGoogle: () => sessionManager.signInWithGoogle(),
    signOut: () => sessionManager.logout(),
  }
}
