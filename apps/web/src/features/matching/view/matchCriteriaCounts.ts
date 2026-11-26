import type { MatchAxisResult } from '@bellum/contracts'

/**
 * Théo C projects-rapprochement.R1 / N3 — « N critères étayés · N à confirmer ».
 *
 * Un axe évalué est ÉTAYÉ (même à 0 : c'est une mesure) ; un axe non évaluable
 * est À CONFIRMER — il n'est jamais compté comme un échec (« un inconnu ne
 * devient pas un non »). Aucun axe du tout → `null` : on ne dit pas « 0 critère ».
 */
export function matchCriteriaCounts(
  axes: readonly Pick<MatchAxisResult, 'score'>[],
): { backed: number; toConfirm: number } | null {
  if (axes.length === 0) return null
  const backed = axes.filter(axis => axis.score !== null).length
  return { backed, toConfirm: axes.length - backed }
}
