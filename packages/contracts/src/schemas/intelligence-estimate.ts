import type { AccountIntelligenceSource } from './account-intelligence-context.js'
import type { AngleProofState } from './analysis/strategy.js'

/**
 * #4016.L4 (décision Louis 11/10, `c95_estimation_badgee` ; lot V10-E 17/10) — QUAND une valeur affichée
 * est une ESTIMATION, et sous quelle forme. Une valeur estimée est toujours badgée (`EstimatedBadge`, une
 * seule primitive, GA-26), jamais présentée comme un fait, jamais une probabilité de closing (doctrine :
 * la probabilité vit dans Pilotage seulement). Absente = aucune ligne, aucun badge.
 *
 * Les formes, fermées et en fin de liste seulement (GA-08) : `estimated` (une valeur déduite, ex. un e-mail
 * selon le motif), `probable` (un lien ou un fait indiqué mais pas observé), `hypothesis` (un angle, une
 * porte d'entrée sans preuve), `suggested` (préremplie à la saisie).
 */
export const ESTIMATE_KINDS = ['estimated', 'probable', 'hypothesis', 'suggested'] as const
export type EstimateKind = (typeof ESTIMATE_KINDS)[number]

/**
 * Les sources du contexte canonique qui ne sont PAS une observation de CE compte : l'inférence du modèle,
 * la mémoire marché (des parcours vus AILLEURS) et les priors de la base de référence. Tout le reste —
 * correction humaine, donnée courante, registre, outil branché, source publique lue — est observé.
 */
const NOT_OBSERVED_SOURCES: readonly AccountIntelligenceSource[] = ['inference', 'market_memory', 'dataforge']

/** La forme d'estimation d'un fait canonique, ou `null` s'il est observé (aucun badge). */
export function intelligenceEstimateKind(
  source: AccountIntelligenceSource,
  as: Extract<EstimateKind, 'probable' | 'hypothesis'>,
): EstimateKind | null {
  return NOT_OBSERVED_SOURCES.includes(source) ? as : null
}

/** Un angle d'attaque sans preuve MOBILISABLE est une hypothèse ; avec, il n'est pas badgé. */
export function angleEstimateKind(proofState: AngleProofState): Extract<EstimateKind, 'hypothesis'> | null {
  return proofState === 'mobilisable' ? null : 'hypothesis'
}
