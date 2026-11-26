import type { ActionPlanItem } from '@bellum/contracts'

/**
 * #3265.13 (épopée #3287) — la dernière action FAITE de ce compte qui porte
 * une issue déclarée, sur la même ligne que le Plan de compte et la fiche
 * Contact (`action_plan_items`), jamais une copie. Aucun filtre par contact :
 * `usePlanItems(accountId)` scope déjà la lecture au compte — c'est le
 * pendant « compte » de `selectContactPlanState` (`ContactLastOutcomeCard`).
 */
export function selectAccountLastOutcome(items: readonly ActionPlanItem[]): ActionPlanItem | null {
  return (
    items
      .filter(item => item.execution_status === 'done' && item.outcome !== null)
      .sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''))[0] ?? null
  )
}
