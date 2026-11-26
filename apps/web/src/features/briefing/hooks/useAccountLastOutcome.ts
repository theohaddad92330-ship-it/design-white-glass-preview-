import { useQuery } from '@tanstack/react-query'
import type { ActionPlanItem } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { lastOutcomeBatcher } from '../lib/account-last-outcome-batch'

/**
 * Le dernier résultat déclaré d'UN compte du briefing, lu par le regroupeur : toutes les lignes
 * montées ensemble partagent un seul appel. La clé reste sous `['plan-items']` — cocher une action
 * (`useCompleteRelance`) invalide ce préfixe, la ligne se rafraîchit comme avant.
 */
export function useAccountLastOutcome(accountId: string | undefined): ActionPlanItem | null {
  const { user } = useSession()
  const { data } = useQuery({
    queryKey: ['plan-items', 'last-outcome', accountId],
    queryFn: () => lastOutcomeBatcher.load(accountId ?? ''),
    enabled: !!user && !!accountId,
    staleTime: 30_000,
  })
  return data ?? null
}
