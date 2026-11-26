import { useQuery } from '@tanstack/react-query'
import type { MarketEsnViewRead } from '@bellum/contracts'
import { esnProfileApi, esnProfileKeys } from '@/features/profile/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #1636 — ce que la mémoire marché observe de l'entreprise de l'espace.
 *
 * ⚠️ `MarketEsnViewRead` porte DÉJÀ ses états — `undeclared`, `insufficient`,
 * `unavailable`. Le hook ne les retraduit pas et n'invente pas de repli : un
 * `undefined` de React Query pendant le chargement est le seul état qui lui
 * appartienne, et le bloc ne rend alors rien plutôt que d'annoncer une absence
 * de couverture qu'il n'a pas encore mesurée.
 */
export function useEsnMarketMemory() {
  const { user } = useSession()
  return useQuery<MarketEsnViewRead>({
    queryKey: esnProfileKeys.marketMemory,
    queryFn: () => esnProfileApi.getMarketMemory(),
    enabled: !!user,
    staleTime: 5 * 60_000,
  })
}
