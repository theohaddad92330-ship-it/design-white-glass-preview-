import { isAccountInterestPenetrabilityUnavailable, type AccountInterestPenetrability } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * BEL-SC-229 (#3258, P0) — LA matrice `AccountInterestPenetrability`, lue par
 * l'écran qui la montre. Même forme que `useAccountStrategy5P` (#3254) : une
 * façade `@Optional()` rend `{ status: 'unavailable' }`, jamais une matrice
 * vide — l'écran doit se TAIRE plutôt que d'afficher « rien de connu ».
 */
export function useAccountInterestPenetrability(accountId: string | undefined) {
  const { user } = useSession()

  return useQuery<AccountInterestPenetrability | null>({
    queryKey: accountKeys.interestPenetrability(accountId),
    queryFn: async () => {
      const response = await accountsApi.getInterestPenetrability(accountId!)
      return isAccountInterestPenetrabilityUnavailable(response) ? null : (response ?? null)
    },
    enabled: Boolean(accountId) && !!user,
    staleTime: 5 * 60_000,
    /** Une façade non montée est une RÉPONSE, pas un incident réseau. */
    retry: false,
  })
}
