import { useQuery } from '@tanstack/react-query'
import type { AccountMarketPaths } from '@bellum/contracts'
import { accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/** #5192 — le détail des parcours observés d'UN compte, lu à l'OUVERTURE de la modale seulement (`enabled`). */
export function useAccountMarketPaths(accountId: string | undefined, enabled: boolean) {
  const { user } = useSession()
  return useQuery<AccountMarketPaths>({
    queryKey: ['accounts', 'market-paths', accountId],
    queryFn: () => accountsApi.getMarketPaths(accountId!),
    enabled: Boolean(accountId) && !!user && enabled,
    staleTime: 5 * 60_000,
    // Un 503 est une RÉPONSE (« on n'a pas pu lire »), pas un incident réseau à rejouer.
    retry: false,
  })
}
