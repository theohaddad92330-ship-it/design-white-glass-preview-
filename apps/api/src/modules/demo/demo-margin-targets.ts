import { monthsBackLastDay } from '@bellum/contracts'

/**
 * L'OBJECTIF MENSUEL DE MARGE de la salle de démonstration (D7 du 26/08, levé
 * par Louis le 31/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL FAUT LE SEMER
 * ─────────────────────────────────────────────────────────────────────────────
 * Sans objectif saisi, l'anneau « Taux de réalisation » dit « objectif non
 * défini » et n'affiche aucun pourcentage. C'est le comportement JUSTE — et,
 * dans une salle de démonstration, c'est un écran qui se lit « le produit ne
 * sait pas mesurer ». Le lien de démonstration est ce qu'un prospect voit du
 * produit : un écran livré mais vide se découvre en réunion, pas en CI.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS MOIS, ET DES DATES CALCULÉES
 * ─────────────────────────────────────────────────────────────────────────────
 * L'écran ouvre sur le mois PRÉCÉDENT (`defaultFinancePeriod`). Un objectif posé
 * sur le seul mois courant laisserait donc l'écran d'ARRIVÉE sans cible — le
 * défaut le plus facile à ne pas voir, puisqu'il faut changer de période pour
 * s'en apercevoir. Trois mois couvrent l'arrivée et le recul immédiat.
 *
 * ⚠️ Les mois sont CALCULÉS à chaque semis, jamais écrits en dur — même règle
 * que les photos mensuelles d'à côté, et pour la même raison : un objectif figé
 * sur « 2026-08 » cesserait d'être trouvé au premier changement de mois, et
 * l'anneau redeviendrait muet sans qu'aucun test ne rougisse.
 *
 * ⚠️ Ces valeurs sont FICTIVES, comme tout le contenu de la salle, et ne sont
 * écrites que sur l'espace de démonstration. Aucun espace client ne reçoit
 * d'objectif par défaut : c'est précisément ce que le revirement interdit.
 */

/**
 * Les objectifs semés : un par mois, du plus ancien au plus récent.
 *
 * 30 % / 30 % / 32 % — un relèvement de cible entre les deux derniers mois. Ce
 * n'est pas décoratif : il montre que l'objectif est un RÉGLAGE daté qui se
 * révise, et non une constante du produit. Les trois restent au-dessus de la
 * marge semée, ce qui fait un anneau « pas encore atteint » — l'état par défaut
 * d'un mois en cours, et celui qui donne le plus à voir.
 */
const DEMO_TARGET_PERCENTS = [30, 30, 32] as const

export function demoMarginTargets(now: Date = new Date()): Array<{ month: string; targetPercent: number }> {
  return DEMO_TARGET_PERCENTS.map((targetPercent, index) => ({
    // `monthsBackLastDay` rend une DATE (`AAAA-MM-JJ`) ; l'objectif est indexé
    // par MOIS. On coupe au mois plutôt que de recalculer : deux façons de dire
    // « il y a N mois » divergeraient sur les fins de mois, et la photo
    // mensuelle d'à côté utilise exactement celle-ci.
    month: monthsBackLastDay(now, DEMO_TARGET_PERCENTS.length - index).slice(0, 7),
    targetPercent,
  }))
}
