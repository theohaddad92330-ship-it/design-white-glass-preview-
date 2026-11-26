import type { ActiveAnalysisRun } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { accountsApi } from '@/features/accounts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2145.9 / #2100.9 — un job d'analyse important en attente, mis en avant par
 * Aujourd'hui. Lit `GET /accounts/analyzing`, cloisonné comme le reste du
 * portefeuille (même scope que la liste de comptes).
 *
 * ⚠️ L'APPELANT MANQUANT : `useAnalysisStore` ne connaît QUE les comptes que
 * cette session a ouverts/lancés ; il ne peut pas dire « un job tourne ailleurs
 * dans le portefeuille ». Ce hook lit la source côté serveur, la seule qui
 * connaisse l'état RÉEL de tout l'espace.
 */
export function useActiveAnalysisRuns() {
  const { user } = useSession()

  return useQuery<ActiveAnalysisRun[]>({
    queryKey: ['accounts', 'analyzing'],
    queryFn: () => accountsApi.listActiveAnalysisRuns(),
    enabled: Boolean(user),
    // Un job dure plusieurs minutes (3-6, doc pipeline) : pas besoin d'un
    // rafraîchissement agressif pour une mise en avant, pas un suivi live.
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
}
