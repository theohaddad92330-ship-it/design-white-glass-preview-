import { useQuery } from '@tanstack/react-query'
import { googleApi, type GoogleStatus } from '@/features/google/api'
import { useSession } from '@/lib/hooks/use-session'

export const GOOGLE_STATUS_KEY = ['google-status'] as const

/** Google Workspace connection + granted-capability status for the active user. */
export function useGoogleStatus() {
  const { user } = useSession()
  return useQuery<GoogleStatus>({
    queryKey: [...GOOGLE_STATUS_KEY, user?.id],
    queryFn: () => googleApi.status(),
    enabled: !!user,
    staleTime: 30_000,
  })
}
