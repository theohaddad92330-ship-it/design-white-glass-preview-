import { useRef } from 'react'

/**
 * Vrai quand un groupe de résultats est apparu alors qu'un rendu PRÉCÉDENT affichait déjà d'autres lignes sans lui ;
 * se réarme à la fermeture / nouvelle saisie. Règle d'ordre stable sous le pointeur : un groupe arrivé en retard
 * s'insère SOUS les lignes déjà affichées, jamais au-dessus (un clic ne tombe pas sur une autre entité).
 * Un seul endroit (GA-26) : la recherche d'entreprise ET la palette globale l'utilisent.
 */
export function useLateGroup(open: boolean, query: string, hasGroup: boolean, hasShownRows: boolean): boolean {
  const state = useRef({ query, late: false, seen: false, registryShown: false })
  if (!open || state.current.query !== query) {
    state.current = { query, late: false, seen: false, registryShown: false }
  }
  if (hasGroup && !state.current.seen) {
    state.current.seen = true
    state.current.late = state.current.registryShown
  }
  if (!hasGroup && hasShownRows) state.current.registryShown = true
  return state.current.late
}
