import { chainFlowSteps, type Chain, type ChainDerivation } from '@bellum/contracts'

/**
 * UNE SEULE phase sur la fiche besoin (#3348).
 *
 * Recette prod 01/10 : le bandeau d'étapes disait « Matching lancé : franchie »
 * + « Étape en cours : Décision client obtenue » pendant que le badge de la
 * fiche (et la ligne « Suivi ») répétaient « Matching à lancer » — le statut
 * DÉCLARÉ, resté en arrière des faits. Le parcours se dérive des faits
 * (`derivePosition` prend la position la plus avancée) : quand il a dépassé
 * le matching, c'est lui qui dit la phase ; le statut déclaré ne parle plus
 * que tant qu'il n'est pas contredit.
 */
const BEFORE_MATCHING_RUN = new Set(['to_qualify', 'qualified', 'to_match'])
const MATCHING_RUN_STEP = 3

/** L'étape du parcours à afficher à la place d'un statut dépassé, sinon `null` (le statut déclaré vaut). */
export function overtakenPhaseLabel(
  status: string,
  chain: Chain | undefined,
  derivation: ChainDerivation | undefined,
  locale: 'fr' | 'en',
): string | null {
  if (!chain || derivation?.kind !== 'at') return null
  if (!BEFORE_MATCHING_RUN.has(status) || derivation.position <= MATCHING_RUN_STEP) return null
  return chainFlowSteps(chain).find(step => step.position === derivation.position)?.label[locale] ?? null
}
