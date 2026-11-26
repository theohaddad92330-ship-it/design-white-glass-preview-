import {
  isAccountInterestPenetrabilityPortfolioUnavailable,
  type AccountInterestPenetrabilityPortfolio,
} from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * BEL-SC-229 (#3258.13, épopée #3362, lot P01) — LA LECTURE PORTEFEUILLE de
 * la matrice `AccountInterestPenetrability`. Même forme que
 * `useAccountInterestPenetrability` (compte unique) : une façade
 * `@Optional()` non montée rend `{ status: 'unavailable' }`, jamais un
 * portefeuille vide — l'écran doit se TAIRE plutôt que d'afficher « aucun
 * compte ».
 */
export function useAccountInterestPenetrabilityPortfolio() {
  const { user } = useSession()

  return useQuery<AccountInterestPenetrabilityPortfolio | null>({
    queryKey: accountKeys.interestPenetrabilityPortfolio(),
    queryFn: async () => {
      const response = await accountsApi.getInterestPenetrabilityPortfolio()
      return isAccountInterestPenetrabilityPortfolioUnavailable(response) ? null : (response ?? null)
    },
    enabled: !!user,
    staleTime: 5 * 60_000,
    /** Une façade non montée est une RÉPONSE, pas un incident réseau. */
    retry: false,
  })
}
