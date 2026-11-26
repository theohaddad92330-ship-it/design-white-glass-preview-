import { useQuery } from '@tanstack/react-query'
import type { ProfileContextRevisionSummary } from '@bellum/contracts'
import { profileContextApi, profileContextKeys } from '@/features/profile-context/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Past snapshots of the user's BellumAI profile-context (newest first), for the
 * « Versions » panel. Every regeneration appends one, so the list grows over time.
 */
export function useProfileContextRevisions(enabled = true) {
  const { user } = useSession()
  return useQuery<ProfileContextRevisionSummary[]>({
    queryKey: profileContextKeys.revisions,
    queryFn: () => profileContextApi.listRevisions(),
    enabled: !!user && enabled,
    staleTime: 30_000,
  })
}
