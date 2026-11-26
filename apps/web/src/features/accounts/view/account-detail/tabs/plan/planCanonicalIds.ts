import {
  generatedPlanStepPosition,
  MANUAL_ACTION_WEEK_INDEX,
  type ActionPlanItem,
  type CanonicalAction,
} from '@bellum/contracts'

/**
 * #2871 (#2395.1/.5/.11) — l'identité CANONIQUE de chaque ligne du tableau,
 * LUE dans la projection du compte (`GET /accounts/:id/actions`), jamais
 * recalculée ici : la projection a déjà dédoublonné (une étape actée y porte
 * l'id de sa ligne `plan_item`, une étape proposée son id `generated_plan`).
 *
 * Deux clés, parce que le tableau adresse ses lignes de deux façons :
 *  - `slot(phase, étape)` — une étape du plan généré, actée ou non ;
 *  - `item(id)` — une ligne saisie à la main (bande manuelle).
 */
export type CanonicalIds = {
  forStep: (weekIndex: number, stepIndex: number) => string | undefined
  forItem: (itemId: string) => string | undefined
}

export function canonicalIdsOf(
  actions: readonly CanonicalAction[] | undefined,
  items: readonly ActionPlanItem[],
): CanonicalIds {
  const bySlot = new Map<string, string>()
  const byItem = new Map<string, string>()
  const itemsById = new Map(items.map(item => [item.id, item]))
  for (const action of actions ?? []) {
    const generated = generatedPlanStepPosition(action)
    if (generated) {
      bySlot.set(slotKey(generated.weekIndex, generated.stepIndex), action.action_id)
      continue
    }
    if (action.origin.model !== 'plan_item') continue
    const item = itemsById.get(action.origin.id)
    if (!item) continue
    if (item.week_index >= MANUAL_ACTION_WEEK_INDEX) byItem.set(item.id, action.action_id)
    else bySlot.set(slotKey(item.week_index, item.step_index), action.action_id)
  }
  return {
    forStep: (weekIndex, stepIndex) => bySlot.get(slotKey(weekIndex, stepIndex)),
    forItem: itemId => byItem.get(itemId),
  }
}

function slotKey(weekIndex: number, stepIndex: number): string {
  return `${weekIndex}-${stepIndex}`
}
