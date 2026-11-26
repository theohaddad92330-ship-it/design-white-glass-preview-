import { useRef } from 'react'

/**
 * Ordre d'ARRIVÉE des groupes d'une liste de résultats, pour une même saisie : un groupe arrivé après un autre
 * s'affiche SOUS lui, jamais au-dessus — une ligne déjà visible ne bouge pas sous le pointeur (recette prod 03/11 :
 * « Contacts » puis « Comptes » arrivaient au-dessus de « Besoins » déjà affiché). Les groupes présents dès le même
 * rendu gardent l'ordre canonique de `present`. L'ordre se réarme à la fermeture et à chaque nouvelle saisie.
 */
export function useArrivalOrder<K extends string>(open: boolean, query: string, present: readonly K[]): K[] {
  const state = useRef<{ query: string; order: K[] }>({ query, order: [] })
  if (!open || state.current.query !== query) {
    state.current = { query, order: [] }
  }
  for (const key of present) {
    if (!state.current.order.includes(key)) state.current.order.push(key)
  }
  return state.current.order.filter(key => present.includes(key))
}
