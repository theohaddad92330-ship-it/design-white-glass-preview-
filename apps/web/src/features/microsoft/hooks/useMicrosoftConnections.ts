import { useQuery } from '@tanstack/react-query'
import { microsoftApi, type MicrosoftConnection } from '@/features/microsoft/api'
import { useSession } from '@/lib/hooks/use-session'

export const MICROSOFT_CONNECTIONS_KEY = ['microsoft-connections'] as const

/** #4546.4 — les boîtes Outlook du commercial, une ligne par connexion. */
export function useMicrosoftConnections(enabled = true) {
  const { user } = useSession()
  return useQuery<MicrosoftConnection[]>({
    queryKey: [...MICROSOFT_CONNECTIONS_KEY, user?.id],
    queryFn: () => microsoftApi.connections(),
    enabled: enabled && !!user,
    staleTime: 30_000,
  })
}
