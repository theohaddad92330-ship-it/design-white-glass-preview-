import { useQuery } from '@tanstack/react-query'
import { crmApi, type CrmDealPipelines } from '@/features/crm/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #1934.18 — les pipelines d'affaires et leurs stades RÉELS.
 *
 * Ne part que si un CRM a répondu à la lecture de présence (`enabled`) : sans
 * CRM, la question « vers quel stade ? » ne se pose pas, et l'appel serait du
 * bruit sur chaque compte.
 */
export function useCrmDealPipelines(enabled: boolean) {
  const { user } = useSession()
  return useQuery<CrmDealPipelines>({
    queryKey: ['crm', 'deal-pipelines', user?.id],
    queryFn: () => crmApi.dealPipelines(),
    enabled: !!user && enabled,
    staleTime: 5 * 60_000,
  })
}
