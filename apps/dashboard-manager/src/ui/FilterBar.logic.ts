/**
 * #1673.1 — LA logique de `FilterBar`, l'unique composant de filtre du
 * back-office. Ce fichier ne rend rien : il décide ce qu'un libellé de pilule
 * affiche, si le bouton « Effacer » a un sens, combien de filtres avancés le
 * panneau peut porter, et comment un filtre s'écrit dans l'URL plutôt que dans
 * un `useState` local (#1673.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS IMPLÉMENTATIONS DIVERGENTES DEVIENNENT UNE
 * ─────────────────────────────────────────────────────────────────────────────
 * Avant ce lot : `Pill` + `useState` (clients, utilisateurs), un `<select>`
 * (monitoring), des `<a>` stylées « pilule » (files, audit). Les trois
 * savaient FILTRER ; aucune ne vivait dans l'URL de façon uniforme, et
 * `clients-table.tsx` / `users-table.tsx` perdaient leur filtre au moindre
 * partage de lien ou retour arrière. `withFilterInSearch` /
 * `readFilterFromSearch` généralisent le motif déjà juste de
 * `app/queues/page.tsx:97,126` (son `href()` et son `toState()`) pour qu'il ne
 * s'écrive plus qu'une fois.
 */

export type FilterPillDef = {
  key: string
  label: string
  /** `null` = non mesuré. La doctrine ne l'affiche JAMAIS comme un « · 0 » —
   *  un zéro RÉEL (aucune alerte en ce moment) reste un zéro affiché. */
  count: number | null
}

/** « Tous · 12 », ou « Tous » seul quand le compte n'a pas pu être mesuré. */
export function formatPillLabel(pill: FilterPillDef): string {
  return pill.count === null ? pill.label : `${pill.label} · ${pill.count}`
}

/** Le bouton « Effacer » n'a de sens que si on s'est écarté du défaut. */
export function isDirty(activeKey: string, defaultKey: string): boolean {
  return activeKey !== defaultKey
}

export const MAX_ADVANCED_FILTERS = 6

/** Exporté : `FilterBar.tsx` l'étend avec son `control` (un `ReactNode`, donc
 *  hors de cette logique pure) pour typer sa prop `advanced`. */
export type AdvancedFilterDef = { key: string; label: string }

/**
 * Le panneau « Filtres avancés » ne dépasse jamais 6 champs (#1673.1). Un
 * appelant qui en fournit davantage est coupé, pas rejeté — la garantie porte
 * sur l'ÉCRAN, pas sur l'appelant, qui reste libre d'en préparer plus pour un
 * autre contexte.
 */
export function capAdvancedFilters<T extends AdvancedFilterDef>(
  fields: readonly T[],
): { fields: T[]; truncated: boolean } {
  return { fields: fields.slice(0, MAX_ADVANCED_FILTERS), truncated: fields.length > MAX_ADVANCED_FILTERS }
}

/**
 * #1673.2 — écrit (ou retire) UNE clé dans une chaîne de recherche, sans
 * toucher aux autres. La valeur par défaut ne s'écrit jamais dans l'URL : un
 * lien copié « à l'état par défaut » doit rester un lien propre, pas
 * `?filtre=tous`.
 */
export function withFilterInSearch(currentSearch: string, key: string, value: string, defaultValue: string): string {
  const qs = new URLSearchParams(currentSearch)
  if (value === defaultValue) {
    qs.delete(key)
  } else {
    qs.set(key, value)
  }
  return qs.toString()
}

/**
 * Lit une valeur de filtre depuis l'URL. Une valeur absente OU inventée
 * (quelqu'un a tapé l'URL à la main) retombe sur le défaut — jamais sur
 * `undefined`, qui forcerait chaque appelant à revalider derrière elle.
 */
export function readFilterFromSearch<T extends string>(
  currentSearch: string,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const value = new URLSearchParams(currentSearch).get(key)
  return (allowed as readonly string[]).includes(value ?? '') ? (value as T) : fallback
}
