import { useQuery } from '@tanstack/react-query'
import type { AccountJobOffers } from '@bellum/contracts'
import { accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Louis 30/10 — les offres du compte pour le métier saisi. Ne part qu'au geste (`term !== null`) :
 * ouvrir la veille ne cherche rien. Gardées dix minutes ; aucune reprise : un échec se DIT.
 */
export function useAccountJobOffers(accountId: string | undefined, term: string | null) {
  const { user } = useSession()
  return useQuery<AccountJobOffers>({
    queryKey: ['accounts', 'job-offers', accountId, term],
    queryFn: () => accountsApi.getJobOffers(accountId!, term ?? ''),
    enabled: Boolean(accountId) && !!user && term !== null,
    staleTime: 10 * 60_000,
    retry: false,
  })
}
