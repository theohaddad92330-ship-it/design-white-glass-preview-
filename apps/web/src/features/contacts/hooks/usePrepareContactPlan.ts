import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ActionPlanItem } from '@bellum/contracts'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { planItemsKey } from '@/features/actions/hooks/usePlanItems'
import { myPlanActionsKey } from '@/features/actions/hooks/useMyPlanActions'
import { planItemsApi } from '@/features/actions/planItems.api'

/**
 * #4416 — « Préparer un plan pour <prénom> » : range 2-3 étapes pour ce contact dans le plan du COMPTE, puis
 * rafraîchit le plan (celui de l'onglet Plan et `/actions` lisent les mêmes lignes). Rien n'est envoyé.
 */
export function usePrepareContactPlan(accountId: string, contactId: string) {
  const queryClient = useQueryClient()
  return useMutation<ActionPlanItem[], Error, void>({
    mutationFn: () =>
      planItemsApi.prepareForContact({
        account_id: accountId,
        contact_id: contactId,
        locale: i18n.language.startsWith('en') ? 'en' : 'fr',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: planItemsKey(accountId) })
      void queryClient.invalidateQueries({ queryKey: myPlanActionsKey })
      toast.success(i18n.t('accountDetail:planSteps.generated'))
    },
    onError: () => toast.error(i18n.t('accountDetail:planSteps.generateFailed')),
  })
}
