import type { Account, AccountPlanMutationResponse, CreatedPlanAction, UserAttackAngle } from '@bellum/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { announceCreatedPlanAction, rememberCreatedPlanAction } from '@/features/actions/hooks/usePlanItems'
import { planItemsApi, type PlanActionInput } from '@/features/actions/planItems.api'
import { saveQuerySnapshot } from '@/lib/cache/idb/query-snapshots'

export function usePersistAccountPlan(accountId: string) {
  const queryClient = useQueryClient()
  const applyResponse = (response: AccountPlanMutationResponse) => {
    const key = accountKeys.detail(accountId)
    const current = queryClient.getQueryData<Account>(key)
    if (!current) return
    const next = { ...current, raw_analysis: response.raw_analysis }
    queryClient.setQueryData(key, next)
    void saveQuerySnapshot(key, next)
  }
  /**
   * #2123.46 — « Ajouter au plan » depuis la veille, la fiche contact et le
   * panneau besoin écrit la ligne CANONIQUE (`POST /plan-items`), celle que le
   * plan du compte affiche et que `/actions` liste. Il écrivait
   * `raw_analysis.user_plan_actions` (`POST /accounts/:id/plan/actions`, porte
   * retirée) : un blob qu'aucun autre écran ne lit, et qu'on ne réécrit plus —
   * il reste LU comme historique.
   */
  const actionMutation = useMutation<CreatedPlanAction, Error, PlanActionInput>({
    mutationFn: action => planItemsApi.create({ account_id: accountId, ...action }),
    onSuccess: created => {
      rememberCreatedPlanAction(queryClient, created)
      announceCreatedPlanAction(created)
    },
    onError: () => toast.error(i18n.t('accounts:toast.actionAddError')),
  })
  const angleMutation = useMutation({
    mutationFn: (angle: UserAttackAngle) => accountsApi.addAttackAngle(accountId, angle),
    onSuccess: response => {
      applyResponse(response)
      toast.success(i18n.t('accounts:toast.angleAdded'))
    },
    onError: () => toast.error(i18n.t('accounts:toast.angleAddError')),
  })

  return {
    addAction: actionMutation.mutateAsync,
    addAngle: angleMutation.mutateAsync,
    isPending: actionMutation.isPending || angleMutation.isPending,
  }
}
