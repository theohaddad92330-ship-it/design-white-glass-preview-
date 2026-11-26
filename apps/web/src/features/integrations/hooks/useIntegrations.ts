import { useQuery } from '@tanstack/react-query'
import { integrationsApi, type IntegrationStatus } from '@/features/integrations/api'
import { useSession } from '@/lib/hooks/use-session'

export const INTEGRATIONS_KEY = ['integrations'] as const

export function useIntegrations() {
  const { user } = useSession()
  return useQuery<IntegrationStatus[]>({
    queryKey: [...INTEGRATIONS_KEY, user?.id],
    // Coerce anything non-array to an empty list so the screen never crashes.
    queryFn: async () => {
      const res = await integrationsApi.list()
      return Array.isArray(res) ? res : []
    },
    enabled: !!user,
    staleTime: 30_000,
  })
}
