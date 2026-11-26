import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/lib/hooks/use-session'
import { planItemsApi } from '../planItems.api'
import { myPlanActionsKey } from './useMyPlanActions'

/**
 * #4418.1 — COMBIEN d'actions ouvertes existent, au-delà du plafond de 200 lignes de `GET /plan-items/mine`.
 *
 * La liste « Mes relances » est coupée à 200 (tri par échéance, sans échéance en dernier) : à 216 actions, une
 * tâche venue d'être créée sans date n'apparaissait nulle part, et rien ne le disait. `MyRelancesList` compare ce
 * total à ce qu'elle montre et NOMME l'écart.
 *
 * La clé commence par `['plan-items']` : l'invalidation de `useCompleteRelance` / `usePlanItems` la rafraîchit
 * avec la liste. Une clé distincte par filtre, comme `useMyActions` : le total « en retard » n'est pas le total.
 */
export function useMyActionsCount(overdueOnly = false) {
  const { user } = useSession()

  return useQuery<{ open: number } | null>({
    queryKey: [...myPlanActionsKey, 'count', overdueOnly ? 'overdue' : 'all'],
    queryFn: () => planItemsApi.mineCount({ overdue: overdueOnly }),
    enabled: Boolean(user),
    staleTime: 30_000,
  })
}
