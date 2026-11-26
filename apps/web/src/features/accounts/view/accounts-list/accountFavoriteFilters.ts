/**
 * #2150.14/.18 — « MES FAVORIS », RÉTABLI (revirement assumé de #1800,
 * Louis 15/09/2026) — ET #2150.15 — « PORTÉS PAR UN COLLÈGUE ».
 *
 * Extrait de `AccountsPage.tsx` (même raison que `marketCoveredCounter.ts`
 * juste à côté) pour que la lecture de l'URL et l'écriture des deux bascules
 * se PROUVENT sans monter tout l'écran : un rechargement de page ne fait rien
 * d'autre que rappeler `favoriteFilterOf`/`ownershipFilterOf` sur un nouvel
 * objet `search` fraîchement analysé depuis l'URL, donc les tester avec un
 * objet construit à la main REPRODUIT exactement ce cas.
 *
 * Les deux bascules s'EXCLUENT mutuellement à l'écran : cliquer l'une efface
 * l'autre (`nextFavoriteSearch` / `nextOwnershipSearch`) — deux angles
 * distincts du même portefeuille, jamais posés ensemble par CE geste (rien
 * n'empêche un lien partagé de porter les deux, mais aucun clic de cet écran
 * ne le fait).
 */

/** Non exportée : elle n'est consommée que dans ce fichier (`lint:exports:types`). */
type AccountFavoriteSearch = {
  readonly favorite?: string
  readonly ownership?: string
}

/** `search.favorite === 'mine'` est la SEULE valeur qui active le filtre. */
export function favoriteFilterOf(search: AccountFavoriteSearch): 'mine' | undefined {
  return search.favorite === 'mine' ? 'mine' : undefined
}

/** `search.ownership === 'teammate'` est la SEULE valeur qui active le filtre. */
export function ownershipFilterOf(search: AccountFavoriteSearch): 'teammate' | undefined {
  return search.ownership === 'teammate' ? 'teammate' : undefined
}

/** #4158.25 — `search.ownership === 'mine'` : « MES COMPTES » (responsable ou co-équipier). */
export function mineFilterOf(search: AccountFavoriteSearch): 'mine' | undefined {
  return search.ownership === 'mine' ? 'mine' : undefined
}

/**
 * Refonte Théo — le sélecteur « Responsable » de la barre : il n'écrit QUE l'axe `ownership`. Les favoris
 * sont un onglet (`favorite`), indépendant : « Favoris » ET « Mes comptes » se combinent.
 */
export function ownerSearch(next: 'all' | 'mine' | 'teammate'): { ownership: 'mine' | 'teammate' | undefined } {
  return { ownership: next === 'all' ? undefined : next }
}
