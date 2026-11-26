import { useQuery } from '@tanstack/react-query'
import { apiKeysApi, type ApiKeySummary } from '@/features/api-keys/api'
import { useSession } from '@/lib/hooks/use-session'

export const API_KEYS_KEY = ['api-keys'] as const

export function useApiKeys() {
  const { user } = useSession()
  return useQuery<ApiKeySummary[]>({
    queryKey: [...API_KEYS_KEY, user?.id],
    // Coerce anything non-array to an empty list so the card never crashes.
    queryFn: async () => {
      const res = await apiKeysApi.list()
      return Array.isArray(res) ? res : []
    },
    enabled: !!user,
    staleTime: 30_000,
  })
}
