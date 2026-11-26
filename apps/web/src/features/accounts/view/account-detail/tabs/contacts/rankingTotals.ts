import type { RankedContact } from '@bellum/contracts'

type RankingTotals = { points: number; max: number; score100: number }

/**
 * Recette 21/10 A.2 (S.24) — UN SEUL calcul pour le total affiché ET pour le détail « Pourquoi ce rang ? ».
 * Vu en recette : huit critères dont la somme faisait 53 sur 85 de maxima, sous un total affiché « 62/100 » lu
 * ailleurs (`ranked.score`). Le total est maintenant celui que le détail additionne : mêmes axes évalués, mêmes
 * points, ramenés sur 100. Un critère qui ne fait que départager n'entre ni dans l'un ni dans l'autre, un axe non
 * évalué sort du dénominateur. `null` quand aucun critère n'est évalué (jamais « 0 »).
 */
export function rankingTotals(
  axes: RankedContact['axes'],
  isTieBreaker: (axisKey: string) => boolean,
): RankingTotals | null {
  let points = 0
  let max = 0
  for (const axis of axes) {
    if (isTieBreaker(axis.key) || axis.points === null) continue
    points += axis.points
    max += axis.max
  }
  if (max <= 0) return null
  return { points, max, score100: Math.round((points * 100) / max) }
}
