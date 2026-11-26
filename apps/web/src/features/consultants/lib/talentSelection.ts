/**
 * #2662.1 — LA SÉLECTION MULTIPLE du vivier (« je veux pouvoir sélectionner
 * tous mes profils », Louis 20/09/2026).
 *
 * Fonctions PURES, testables sans monter `ConsultantsPage.tsx` — même patron
 * que `talentPagination.ts`. La sélection porte sur les lignes CHARGÉES (la
 * page affichée), jamais sur un total serveur que l'écran n'a pas sous les
 * yeux : cocher « tout » ne doit jamais promettre d'agir sur une fiche qui
 * n'est pas encore à l'écran.
 */

/** Tout coché parmi les lignes chargées, jamais vrai sur une liste vide (rien
 *  à cocher n'est pas la même chose que tout coché). */
export function isAllSelected(ids: readonly string[], selected: ReadonlySet<string>): boolean {
  return ids.length > 0 && ids.every(id => selected.has(id))
}

/** Au moins une ligne chargée cochée, mais pas toutes — l'état INDÉTERMINÉ de
 *  la case d'en-tête. Jamais vrai en même temps que `isAllSelected`. */
export function isSomeSelected(ids: readonly string[], selected: ReadonlySet<string>): boolean {
  return !isAllSelected(ids, selected) && ids.some(id => selected.has(id))
}

/** Coche ou décoche TOUTES les lignes chargées d'un coup. */
export function toggleAllSelection(ids: readonly string[], select: boolean): ReadonlySet<string> {
  return select ? new Set(ids) : new Set()
}

/** Coche ou décoche UNE ligne, sans toucher au reste de la sélection. */
export function toggleOneSelection(current: ReadonlySet<string>, id: string, select: boolean): ReadonlySet<string> {
  const next = new Set(current)
  if (select) next.add(id)
  else next.delete(id)
  return next
}
