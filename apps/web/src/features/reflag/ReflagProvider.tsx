import { ReflagProvider as VendorReflagProvider } from '@reflag/react-sdk'
import { useQuery } from '@tanstack/react-query'
import { isDevEnvironment } from '@bellum/utils'
import { memo, type ReactNode } from 'react'
import { teamApi } from '@/features/team/api'
import { TEAM_KEY } from '@/features/team/hooks/useTeam'
import { useSession } from '@/lib/hooks/use-session'

const PUBLISHABLE_KEY: string = import.meta.env.VITE_REFLAG_PUBLISHABLE_KEY ?? ''

/**
 * Reflag's toolbar is a dev-time overlay for flipping flags locally. It defaults
 * to on for localhost, but is pinned explicitly so a future preview/staging
 * build can't surface it to users. Mirrors the React Query devtools gating.
 */
const TOOLBAR_ENABLED: boolean = isDevEnvironment()

type ReflagProviderProps = {
  children: ReactNode
}

/**
 * Bridges the session and the active workspace into Reflag's provider so flag
 * evaluations are scoped to the right user AND tenant. Sits inside
 * `<SessionProvider>`, so the user is hydrated on mount and the context follows
 * login/logout automatically.
 *
 * The company is the WORKSPACE (uuid + name) — the entity that owns the plan and
 * the seats — so a flag can be rolled out to a whole ESN at once. It reuses the
 * Team screen's query key, so this shares one cached request rather than adding
 * its own. Matches the API side, which binds `companyId` to the workspace too.
 *
 * Without `VITE_REFLAG_PUBLISHABLE_KEY` this degrades to a pass-through: the SDK
 * never loads and every `useFlag(...)` returns `{ isEnabled: false }` — the
 * intended local-dev behaviour, and the mirror of the API's fail-open.
 */
export const ReflagProvider = memo<ReflagProviderProps>(function ReflagProvider({ children }) {
  const { user } = useSession()
  // Hooks must run unconditionally, so this is declared before the key check
  // below; `enabled` keeps it from firing for logged-out or unconfigured users.
  const { data: team } = useQuery({
    queryKey: TEAM_KEY,
    queryFn: () => teamApi.getTeam(),
    enabled: Boolean(PUBLISHABLE_KEY) && Boolean(user),
    staleTime: 5 * 60_000,
  })

  if (!PUBLISHABLE_KEY) return <>{children}</>

  const workspace = team?.workspace

  return (
    <VendorReflagProvider
      publishableKey={PUBLISHABLE_KEY}
      toolbar={TOOLBAR_ENABLED}
      context={{
        // The session carries no display name (it moved to the profile), so
        // Reflag gets id + email — enough to target and to identify a user in
        // their dashboard.
        user: user ? { id: user.id, email: user.email } : undefined,
        company: workspace ? { id: workspace.id, name: workspace.name } : undefined,
      }}
    >
      {children}
    </VendorReflagProvider>
  )
})
