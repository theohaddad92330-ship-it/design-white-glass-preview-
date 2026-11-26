/**
 * #2155.24/.25 — LE FORMATAGE D'UN COMPTEUR DE NAV, à un seul endroit.
 *
 * Deux règles, une seule fonction pour que les deux se tiennent ensemble :
 *  1. « Une valeur absente ne s'affiche jamais 0. » `undefined` (mesure
 *     ratée) ET `0` (population vide) rendent tous les deux `undefined` — le
 *     seul contrat qui garantisse qu'aucun appelant ne peut afficher un
 *     compteur vide comme s'il avait compté quelque chose.
 *  2. « Pas de badge à trois chiffres en permanence. » Un compteur ≥ 100 se
 *     plafonne à `99+` plutôt que d'écrire sa vraie valeur — la pilule reste
 *     lisible, et ce n'est de toute façon jamais un volume total (la
 *     définition d'un badge de nav est strictement ACTIONNABLE, #2155.24).
 */
export function formatNavBadgeCount(count: number | undefined): string | undefined {
  if (count === undefined || count <= 0) return undefined
  return count > 99 ? '99+' : String(count)
}
