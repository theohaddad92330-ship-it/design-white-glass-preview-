import type { PlanWeek } from '../../helpers/plan'
import type { NextAction } from './planViewData'

/**
 * #3717.7 — MESURER le recouvrement entre les trois lectures du Plan AVANT de
 * choisir quoi retirer (reste de #3717, épopée #3777) : « Résumé du plan »
 * (`PlanAttackSummary`, `immediateAction`), « Prochaines actions »
 * (`PlanNextMoves`, `nextActions`) et « le tableau » (`ActionPlanBoard`,
 * `planWeeks`) lisent trois champs distincts de la MÊME analyse — rien ne
 * garantissait qu'ils ne répètent pas la même phrase.
 *
 * Comparaison en TEXTE EXACT (casse et espaces de bord ignorés) : les trois
 * champs sont écrits par des étapes différentes du pipeline IA, jamais
 * recalculés les uns à partir des autres (GA-26 n'impose pas une troisième
 * dérivation ici, seulement de ne pas AFFICHER deux fois la même phrase
 * trouvée identique). Une absence (`''`) ne recoupe jamais rien — ce n'est
 * pas un doublon, c'est rien à comparer (GA-18/19).
 */
type PlanListOverlap = {
  /** La « Première action » du résumé répète, mot pour mot, le premier élément de « Prochaines actions ». */
  immediateActionEchoesFirstNextAction: boolean
  /** Combien des « prochaines actions » sont DÉJÀ une ligne du tableau (texte exact). */
  nextActionsEchoedInBoard: number
  nextActionsTotal: number
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function sameText(a: string, b: string): boolean {
  const left = normalize(a)
  const right = normalize(b)
  return left !== '' && right !== '' && left === right
}

export function measurePlanListOverlap(input: {
  immediateAction: string
  nextActions: readonly NextAction[]
  planWeeks: readonly PlanWeek[]
}): PlanListOverlap {
  const boardLabels = input.planWeeks.flatMap(week => week.items.map(item => item.text))
  return {
    immediateActionEchoesFirstNextAction: sameText(input.immediateAction, input.nextActions[0]?.label ?? ''),
    nextActionsEchoedInBoard: input.nextActions.filter(action =>
      boardLabels.some(label => sameText(action.label, label)),
    ).length,
    nextActionsTotal: input.nextActions.length,
  }
}
