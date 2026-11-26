import type { DiscoverFamily, SprintLevel } from '@bellum/contracts'

/**
 * #3408.3 (beta 30/09/2026, #3408) — LE PONT ENTRE LA FAMILLE DE DÉCOUVRIR ET
 * LE NIVEAU D'EFFORT DU BOARD.
 *
 * Le retour demande que Découvrir « permette de produire une sélection
 * structurée : comptes Focus, Sprint, partenaires possibles, à surveiller, à
 * écarter avec motif » — le vocabulaire EXACT du board d'effort (`sprint.ts`,
 * déjà livré pour #3407). Cette fonction ne recalcule RIEN : elle lit la
 * famille que `discoverFamily` (`@bellum/contracts`) a déjà posée pour ce
 * candidat (visible sur chaque carte, `FamilyBadge`) et la NOMME dans ce
 * second vocabulaire, jamais l'inverse.
 *
 * ⚠️ Deux niveaux sur six sont volontairement ABSENTS de cette table :
 *  - `focus` exige un plan de compte (`sprintEntryProblems`) — une famille
 *    « tu peux y aller » ne le fournit pas, elle dit seulement que la porte
 *    est ouverte ET qu'un signal bouge ;
 *  - `watch` exige sa condition de réveil (`sprintDecisionProblems`) — aucune
 *    famille ne la formule, elle est écrite par un commercial.
 * Suggérer l'un ou l'autre depuis la seule famille inventerait la décision
 * humaine que ces deux niveaux exigent — la donnée fictive que la doctrine
 * interdit. Les DEUX restent joignables comme aujourd'hui : au moment où le
 * candidat devient un compte, le formulaire générique du board (doctrine
 * c75) les propose tous les six.
 */
const SUGGESTION_BY_FAMILY: Record<DiscoverFamily, { level: SprintLevel; reasonKey: string }> = {
  out_of_reach: { level: 'no_go', reasonKey: 'outOfReach' },
  via_intermediary: { level: 'partner_route', reasonKey: 'viaIntermediary' },
  reachable: { level: 'extension', reasonKey: 'reachable' },
  investigate: { level: 'volume', reasonKey: 'investigate' },
}

export function suggestedEffortLevelFor(family: DiscoverFamily): { level: SprintLevel; reasonKey: string } {
  return SUGGESTION_BY_FAMILY[family]
}
