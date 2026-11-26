import { usePlanItems } from '@/features/actions/hooks/usePlanItems'
import { useContactsByAccount } from '@/features/contacts/hooks/useContactsByAccount'
import type { PlanWeek } from '../../helpers/plan'
import { selectPlanSteps, type PlanStepView } from './planSteps'

/**
 * #4415.1 — les étapes d'en-tête du plan d'un compte. L'état « fait » vient de la même ligne persistée que
 * le tableau (GA-26) ; tant qu'il charge on ne se prononce pas : le zéro de chargement n'est pas « rien de fait ».
 * `onlyContactId` (#4416.1) restreint aux étapes qui visent ce contact.
 */
export function usePlanSteps({
  accountId,
  weeks,
  rawAnalysis,
  onlyContactId,
}: {
  accountId: string
  weeks: PlanWeek[]
  rawAnalysis: Record<string, unknown>
  onlyContactId?: string
}): PlanStepView[] {
  const planItems = usePlanItems(accountId)
  const { data: contacts } = useContactsByAccount(accountId)
  if (planItems.isLoading) return []
  return selectPlanSteps({
    weeks,
    contacts: contacts ?? [],
    rawAnalysis,
    isDone: (weekIndex, stepIndex) => planItems.itemFor(weekIndex, stepIndex)?.done ?? false,
    onlyContactId,
  })
}
