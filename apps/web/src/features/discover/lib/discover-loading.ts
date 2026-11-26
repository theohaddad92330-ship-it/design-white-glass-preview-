/**
 * #4517 (Louis 24/10, recette prod 27/10) — UN seul chargement par recherche, puis une liste stable.
 *
 * L'écran de chargement ne remplace la liste que pendant la PREMIÈRE attente (ou une recherche relancée). « Voir 10
 * de plus » garde la liste (#3597.5) ; la relecture d'arrière-plan des offres (#4045, `useJobsPendingRetry`) aussi :
 * elle rejouait jusqu'à six fois l'écran de chargement par-dessus des résultats déjà affichés.
 */
export function showsSearchLoading(state: {
  isFetching: boolean
  /** Une réponse de CETTE recherche est déjà à l'écran. */
  hasData: boolean
  /** « Voir 10 de plus » : la liste déjà affichée reste pendant que la page plus grande arrive. */
  keepsList: boolean
  /** La relecture des offres en attente (`jobsPending`) — jamais un second chargement. */
  backgroundRelecture: boolean
}): boolean {
  if (!state.isFetching) return false
  if (!state.hasData) return true
  return !state.keepsList && !state.backgroundRelecture
}
