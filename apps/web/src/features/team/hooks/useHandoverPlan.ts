import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { HandoverAllocation, HandoverPlanResult } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { teamApi } from '../api'
import { MEMBER_PORTFOLIO_KEY } from './useMemberPortfolio'
import { TEAM_KEY } from './useTeam'

// #4158.29 — répartir le portefeuille d'un partant par lots : d'abord le récapitulatif (rien n'est écrit),
// puis la validation. Les deux passent par le même endpoint, `confirm` les distingue.
export function useHandoverPlan(fromUserId: string) {
  const qc = useQueryClient()

  const recap = useMutation<HandoverPlanResult, Error, HandoverAllocation[]>({
    mutationFn: allocations => teamApi.planHandover(fromUserId, { allocations, confirm: false }),
    onError: error => toast.error(error.message || i18n.t('team:handover.plan.toast.failed')),
  })

  const confirm = useMutation<HandoverPlanResult, Error, HandoverAllocation[]>({
    mutationFn: allocations => teamApi.planHandover(fromUserId, { allocations, confirm: true }),
    onSuccess: () => {
      toast.success(i18n.t('team:handover.plan.toast.done'))
      void qc.invalidateQueries({ queryKey: TEAM_KEY })
      void qc.invalidateQueries({ queryKey: MEMBER_PORTFOLIO_KEY(fromUserId) })
    },
    onError: error => toast.error(error.message || i18n.t('team:handover.plan.toast.failed')),
  })

  return { recap, confirm }
}
