import { useQuery } from '@tanstack/react-query'
import type { AccountRecentHires } from '@bellum/contracts'
import { accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #3970 — les recrutements récents du compte, lus sur le parcours déjà connu
 * de ses contacts. Gardés dix minutes : ils ne bougent qu'avec un
 * enrichissement. Aucune reprise : un échec se DIT, il ne se rejoue pas.
 */
export function useAccountRecentHires(accountId: string | undefined) {
  const { user } = useSession()
  return useQuery<AccountRecentHires>({
    queryKey: ['accounts', 'recent-hires', accountId],
    queryFn: () => accountsApi.getRecentHires(accountId!),
    enabled: Boolean(accountId) && !!user,
    staleTime: 10 * 60_000,
    retry: false,
  })
}
