import { useQuery } from '@tanstack/react-query'
import { googleApi, type GoogleConnection } from '@/features/google/api'
import { useSession } from '@/lib/hooks/use-session'

export const GOOGLE_CONNECTIONS_KEY = ['google-connections'] as const

/** #4546.4 — les boîtes Google du commercial, une ligne par connexion. */
export function useGoogleConnections(enabled = true) {
  const { user } = useSession()
  return useQuery<GoogleConnection[]>({
    queryKey: [...GOOGLE_CONNECTIONS_KEY, user?.id],
    queryFn: () => googleApi.connections(),
    enabled: enabled && !!user,
    staleTime: 30_000,
  })
}
