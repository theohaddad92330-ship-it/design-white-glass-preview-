import { useQuery } from '@tanstack/react-query'
import type { AccountMarketContext } from '@bellum/contracts'
import { accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #1582 — le contexte marché d'UN compte, lu quand son popover s'ouvre.
 *
 * `enabled` est ce qui rend la route gratuite pour tout le monde : l'appelant
 * ne la déclenche qu'à l'OUVERTURE du popover. Vingt-cinq lignes affichées ne
 * produisent aucune requête ; une ligne ouverte en produit une, et la garde
 * cinq minutes — la mémoire marché est un corpus ingéré, pas un flux.
 */
export function useAccountMarketContext(accountId: string | undefined, enabled: boolean) {
  const { user } = useSession()

  return useQuery<AccountMarketContext | null>({
    queryKey: ['accounts', 'market-context', accountId],
    queryFn: () => accountsApi.getMarketContext(accountId!),
    enabled: Boolean(accountId) && !!user && enabled,
    staleTime: 5 * 60_000,
    /**
     * ⚠️ AUCUNE reprise. Un 503 « mémoire marché indisponible » est une
     * RÉPONSE, pas un incident réseau : la rejouer trois fois retarde de
     * plusieurs secondes l'affichage de la seule chose honnête à dire, et
     * pendant ce temps le popover reste en chargement — c'est-à-dire
     * indiscernable d'un compte lent.
     */
    retry: false,
  })
}
