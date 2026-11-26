import { useQuery } from '@tanstack/react-query'
import type { WorkspaceRole } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * One member of the caller's active workspace, as returned by
 * `GET /workspaces/members`. `email`/`fullName` may be null when the member's
 * profile row is not backfilled; `isSelf` flags the requesting user.
 */
export type WorkspaceMember = {
  userId: string
  email: string | null
  fullName: string | null
  role: WorkspaceRole
  isSelf: boolean
  /** « Renfort transversal » (#3387.10) — oriente le choix, ne filtre ni ne donne aucun droit. */
  crossTeamSupport?: boolean
}

/**
 * Reads the real members of the user's workspace — the copilot "Membres" panel
 * and every "assign to…" picker (action-plan delegation, account portfolio).
 * Kept lightly cached: team membership rarely changes within a session.
 *
 * The path was `/workspace/members` (singular), which no controller ever
 * served. Consumers absorb the failure with `?? []`, so the 404 surfaced as
 * permanently empty dropdowns rather than an error — the assignment feature
 * looked shipped and was unusable.
 */
export function useWorkspaceMembers() {
  const { user } = useSession()
  return useQuery<WorkspaceMember[], Error>({
    queryKey: ['workspace', 'members', user?.id],
    queryFn: () => apiFetch<WorkspaceMember[]>({ path: '/workspaces/members' }),
    enabled: !!user,
    staleTime: 60_000,
  })
}
