import type { CloseStalePlanItemsResult } from '@bellum/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { planItemsApi } from '../planItems.api'

/**
 * #4485 — « les marquer faites » : la clôture en lot des relances en retard de plus de 30 jours, déclenchée
 * UNIQUEMENT par le clic du bandeau (jamais au chargement). Geste déclaratif : aucune preuve d'envoi.
 *
 * Les deux familles de requêtes sont invalidées, comme `useCompleteRelance` : `['plan-items']` (la file) et
 * `['dashboard']` (les compteurs « relances ouvertes / en retard » lisent la même table).
 */
export function useCloseStaleActions() {
  const queryClient = useQueryClient()
  return useMutation<CloseStalePlanItemsResult, Error, readonly string[]>({
    mutationKey: ['plan-items', 'close-stale'],
    mutationFn: ids => planItemsApi.closeStale(ids),
    onSuccess: result => {
      if (result.closed > 0) {
        toast.success(i18n.t('actions:today.stale.doneToast', { count: result.closed }))
      }
      if (result.failed > 0) {
        toast.error(i18n.t('actions:today.stale.partial', { closed: result.closed, rest: result.failed }))
      }
    },
    onError: () => {
      toast.error(i18n.t('actions:today.stale.error'))
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['plan-items'] })
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}
