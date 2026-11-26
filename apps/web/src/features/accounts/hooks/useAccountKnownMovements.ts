import { useQuery } from '@tanstack/react-query'
import type { AccountKnownMovements } from '@bellum/contracts'
import { accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2556 — sur un compte DÉJÀ connu, ce qui a bougé depuis la dernière
 * analyse, ou l'aveu honnête qu'il n'y a rien de neuf.
 *
 * Montée en PERMANENCE sur le dossier (comme `useAccountMarketContext` ne
 * l'est qu'au clic) : le dossier est une page déjà ouverte exprès, et savoir
 * si le compte est connu conditionne ce que la synthèse doit dire — ce n'est
 * pas un détail qu'on va chercher, c'est la première question du brief.
 */
export function useAccountKnownMovements(accountId: string | undefined) {
  const { user } = useSession()

  return useQuery<AccountKnownMovements>({
    queryKey: ['accounts', 'known-movements', accountId],
    queryFn: () => accountsApi.getKnownMovements(accountId!),
    enabled: Boolean(accountId) && !!user,
    staleTime: 5 * 60_000,
    // ⚠️ AUCUNE reprise — même raison que `useAccountMarketContext` : un 503
    // est une RÉPONSE (le service n'est pas monté), pas un incident réseau.
    retry: false,
  })
}
