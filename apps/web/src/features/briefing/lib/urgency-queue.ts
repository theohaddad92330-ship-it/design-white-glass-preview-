import type { BriefingAction } from '@bellum/contracts'
import { briefingActionUrgencyTier, type BriefingUrgencyTier } from './urgency-tier'

/**
 * « Aujourd'hui » est UNE file, triée par urgence (refonte Théo, 23/10/2026).
 *
 * Le serveur classe déjà les cartes (`priority`, constante par genre) ; ce tri ne
 * recalcule aucun score. Il lit seulement l'URGENCE (`briefingActionUrgencyTier`,
 * #2389.6) et range d'abord ce qui est dû — urgent, puis important, puis
 * opportunité, puis administratif. À urgence égale l'ordre du serveur est
 * conservé : le tri est STABLE, jamais une seconde vérité sur le rang.
 */
const TIER_RANK: Record<BriefingUrgencyTier, number> = {
  urgent: 0,
  important: 1,
  opportunity: 2,
  administrative: 3,
}

export function orderByUrgency(actions: readonly BriefingAction[], now: Date): BriefingAction[] {
  return actions
    .map((action, index) => ({ action, index, rank: TIER_RANK[briefingActionUrgencyTier(action, now)] }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(entry => entry.action)
}
