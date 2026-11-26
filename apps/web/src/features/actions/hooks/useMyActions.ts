import type { MyPlanAction } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/lib/hooks/use-session'
import { planItemsApi } from '../planItems.api'
import { myPlanActionsKey } from './useMyPlanActions'

/**
 * #2114.46/.57 — MES actions ouvertes, tous comptes confondus.
 *
 * ⚠️ L'APPELANT MANQUANT. `GET /plan-items/mine` existe depuis #2123.46 —
 * contrôleur, service, contrat, tests — et **aucune ligne du web ne l'appelait**
 * (`planItems.api.ts` ne portait que `list()` et `update()`). C'est le motif
 * qui revient dans tout le dépôt : du code juste, calculé, testé, que personne
 * n'appelle. Ce hook est son premier lecteur, et la liste du Centre d'actions
 * son premier écran.
 *
 * ⚠️ La clé commence par `['plan-items']` : c'est elle que `useCompleteRelance`
 * invalide. Deux préfixes différents feraient marquer une relance faite sans
 * qu'elle quitte la liste.
 *
 * #2717 — `overdueOnly` restreint à la MÊME portée que la tuile « En retard »
 * du Dashboard. Une clé DISTINCTE (`…, 'overdue'`) plutôt qu'un paramètre
 * ignoré par le cache : la liste complète et la liste filtrée ne sont pas la
 * même réponse, deux vues dessus ne doivent pas s'écraser l'une l'autre.
 * L'invalidation de `useCompleteRelance` cible le PRÉFIXE `['plan-items']` :
 * les deux variantes restent à jour après une relance marquée faite.
 */
export function useMyActions(overdueOnly = false) {
  const { user } = useSession()

  return useQuery<MyPlanAction[]>({
    queryKey: overdueOnly ? [...myPlanActionsKey, 'overdue'] : myPlanActionsKey,
    queryFn: () => planItemsApi.mine({ overdue: overdueOnly }),
    enabled: Boolean(user),
    staleTime: 30_000,
  })
}
