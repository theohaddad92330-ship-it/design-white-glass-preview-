import type { AccountStrategy5PDimension } from '@bellum/contracts'
import { i18n } from '@/i18n'
import type { PlanActionInput } from '@/features/actions/planItems.api'
import { deadlineCalendarValue } from '@/lib/deadline'

/** « cette semaine » — même grammaire d'échéance que `watchSignalToPlanAction`. */
const STRATEGY_GAP_DEADLINE = 'S+1'

/**
 * #3277.3 — « Ajouter au plan » depuis la stratégie 5P : le corps de la ligne
 * canonique (`POST /plan-items`) pour combler LA dimension que la readiness
 * désigne. Une action par P, nommée ; aucun objet ni responsable deviné
 * (`target: null`) — l'écran Plan nommera le manque, comme pour un signal.
 */
export function strategyDimensionToPlanAction(
  dimension: AccountStrategy5PDimension,
  now: Date = new Date(),
): PlanActionInput {
  return {
    label: i18n.t(`accountDetail:strategy5P.planAction.${dimension}.label`),
    target: null,
    reason: i18n.t(`accountDetail:strategy5P.planAction.${dimension}.reason`),
    expected_outcome: i18n.t(`accountDetail:strategy5P.planAction.${dimension}.outcome`),
    due_date: deadlineCalendarValue(STRATEGY_GAP_DEADLINE, now.toISOString()),
  }
}
