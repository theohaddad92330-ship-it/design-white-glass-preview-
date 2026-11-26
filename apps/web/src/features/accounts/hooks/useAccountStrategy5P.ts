import { isAccountStrategy5PUnavailable, type AccountStrategy5P } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * BEL-SC-225 (#3254, P0) — LA projection `AccountStrategy5P`, lue par l'écran
 * qui la montre. Même forme que `useAccountIntelligenceContext` (#2116) : une
 * façade `@Optional()` rend `{ status: 'unavailable' }`, jamais une
 * projection vide — l'écran doit se TAIRE sur les cinq P plutôt que
 * d'afficher « rien de connu ».
 */
export function useAccountStrategy5P(accountId: string | undefined) {
  const { user } = useSession()

  return useQuery<AccountStrategy5P | null>({
    queryKey: accountKeys.strategy5P(accountId),
    queryFn: async () => {
      const response = await accountsApi.getStrategy5P(accountId!)
      return isAccountStrategy5PUnavailable(response) ? null : (response ?? null)
    },
    enabled: Boolean(accountId) && !!user,
    staleTime: 5 * 60_000,
    /** Une façade non montée est une RÉPONSE, pas un incident réseau. */
    retry: false,
  })
}
