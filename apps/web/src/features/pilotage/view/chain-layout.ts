import type { PilotageLevel, PilotageLevelReport, PilotageMetric } from '@bellum/contracts'

/**
 * CE QUI EST UN MAILLON, ET CE QUI N'EN EST PAS — #1433.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE REPROCHE
 * ─────────────────────────────────────────────────────────────────────────────
 * *« Les 8 cartes Acquisition / Conversation / Qualification / Sourcing /
 * Conversion / Économie / Expansion / Qualité sont trop textuelles. »* Elles
 * étaient surtout ÉGALES : une grille de huit cartes à quatre colonnes, où rien
 * ne disait que six d'entre elles se suivent et que deux sont transverses. Un
 * commercial y lisait huit mesures indépendantes, alors que l'écran existe pour
 * montrer un PASSAGE — « un maillon qui décroche se voit avant le résultat ».
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SIX QUI SE SUIVENT, DEUX QUI TRAVERSENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour donne la coupure, et elle est juste : Acquisition → Conversation →
 * Qualification → Sourcing → Conversion → Expansion sont les étapes d'un même
 * flux, chacune alimentée par la précédente — c'est d'ailleurs ce que le calcul
 * fait déjà (`flowStatus(value, upstream)` compare un maillon à celui d'avant).
 *
 * Économie et Qualité ne sont pas des étapes : on ne « passe » pas par la marge
 * ni par le taux de correction. Ce sont des lectures qui portent sur TOUT le
 * flux, et les aligner avec les six ferait croire à une septième et une huitième
 * étape.
 *
 * ⚠️ Les deux listes PARTITIONNENT `PILOTAGE_LEVELS`, et un test le vérifie. Le
 * jour où le contrat gagne un maillon, ce module rougit au lieu de le faire
 * disparaître de l'écran en silence — un niveau calculé que personne n'affiche
 * est le défaut n°1 de ce dépôt.
 */
export const CHAIN_LEVELS = [
  'acquisition',
  'conversation',
  'qualification',
  'sourcing',
  'conversion',
  'expansion',
] as const satisfies readonly PilotageLevel[]

/** Ce qui se lit SUR le flux, jamais DANS le flux. */
export const SECONDARY_LEVELS = ['economie'] as const satisfies readonly PilotageLevel[]

/**
 * Servis par le contrat, affichés NULLE PART : la refonte Pilotage du 14/10/2026 a supprimé Qualité (ses
 * contrôles vivent dans « Données à compléter »). Dans la partition pour que la garde de couverture
 * continue de rougir quand le contrat gagne un maillon.
 */
export const RETIRED_LEVELS = ['qualite'] as const satisfies readonly PilotageLevel[]

/** Les maillons que l'écran compte et montre — jamais un maillon retiré. */
export function displayedLevels(levels: readonly PilotageLevelReport[]): PilotageLevelReport[] {
  return levels.filter(report => !(RETIRED_LEVELS as readonly PilotageLevel[]).includes(report.level))
}

/** Les maillons du passage, dans l'ordre du parcours — jamais celui du serveur. */
export function chainOf(levels: readonly PilotageLevelReport[]): PilotageLevelReport[] {
  return orderedBy(CHAIN_LEVELS, levels)
}

/** Les lectures transverses, sous la chaîne. */
export function secondaryOf(levels: readonly PilotageLevelReport[]): PilotageLevelReport[] {
  return orderedBy(SECONDARY_LEVELS, levels)
}

/**
 * ⚠️ On ordonne par la liste, on ne FILTRE pas la réponse.
 *
 * Trier la réponse du serveur aurait suffi tant que les deux ordres coïncident —
 * et ils coïncident aujourd'hui. Mais l'ordre du parcours est une décision
 * d'AFFICHAGE (`Sourcing` avant `Conversion` parce qu'on staffe avant de
 * signer), pas une propriété du calcul : le laisser dépendre de l'ordre
 * d'énumération du contrat, c'est accepter qu'il change le jour où quelqu'un
 * réordonne l'enum pour une autre raison.
 */
function orderedBy(order: readonly PilotageLevel[], levels: readonly PilotageLevelReport[]): PilotageLevelReport[] {
  return order.flatMap(level => levels.filter(report => report.level === level))
}

/**
 * LA MÉTRIQUE QUI PARLE POUR UN MAILLON.
 *
 * Un maillon en porte jusqu'à trois ; la chaîne compacte n'en montre qu'une, et
 * ce n'est pas « la première ». C'est le TAUX quand il y en a un — un taux
 * mesure le PASSAGE d'un maillon au suivant, c'est-à-dire exactement ce qu'une
 * chaîne existe pour montrer. « 300 emails envoyés » ne dit pas si le maillon
 * tient ; « 2 % de réponse sur 300 envoyés » le dit.
 *
 * À défaut de taux (Acquisition, Sourcing, Expansion n'en portent aucun), le
 * premier compte fait l'affaire : ces maillons-là mesurent un stock ou un
 * volume, et il n'y a rien de plus parlant à choisir.
 */
export function primaryMetric(level: PilotageLevelReport): PilotageMetric | null {
  return level.metrics.find(metric => metric.unit === 'rate') ?? level.metrics[0] ?? null
}
