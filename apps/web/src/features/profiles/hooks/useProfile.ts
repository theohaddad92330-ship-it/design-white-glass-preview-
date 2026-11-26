import { useQuery } from '@tanstack/react-query'
import { saveQuerySnapshot } from '@/lib/cache/idb/query-snapshots'
import type { UserProfile } from '@bellum/contracts'
import { profileApi } from '@/features/profiles/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Full profile for the current user. The API auto-creates a blank row on
 * first fetch, so this never 404s for an authenticated user.
 */
export function useProfile() {
  const { user } = useSession()
  const queryKey = ['profile', 'me', user?.id] as const
  return useQuery<UserProfile>({
    queryKey,
    queryFn: async () => {
      const data = await profileApi.getMe()
      void saveQuerySnapshot(queryKey, data)
      return data
    },
    enabled: !!user,
    staleTime: 60_000,
  })
}
