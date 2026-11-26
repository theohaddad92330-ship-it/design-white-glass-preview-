import { useActiveContactFilters } from './useActiveContactFilters'
import { useContactsSearchState } from './useContactsSearchState'

/**
 * #3376 — le compte affiché sur le déclencheur compact « Filtres », AVANT même
 * de l'ouvrir. UNE formule (GA-26) : la pastille de cycle de vie compte comme un
 * filtre au même titre qu'une puce de `FilterBar`.
 *
 * #3527 — la portée « À qualifier » et une vue ≠ « Toutes » vivent maintenant
 * DANS la section : repliée, elle les compte aussi (jamais un filtre muet).
 */
export function countActiveContactFilters(input: {
  chips: number
  stateFilter: unknown
  unassigned: boolean | undefined
  view: string | undefined
}): number {
  return (
    input.chips +
    (input.stateFilter ? 1 : 0) +
    (input.unassigned ? 1 : 0) +
    (input.view && input.view !== 'all' ? 1 : 0)
  )
}

export function useContactsActiveFilterCount(from: '/contacts/' = '/contacts/'): number {
  const state = useContactsSearchState(from)
  const activeFilters = useActiveContactFilters(state)
  return countActiveContactFilters({
    chips: activeFilters.length,
    stateFilter: state.stateFilter,
    unassigned: state.unassignedFilter,
    view: state.viewFilter,
  })
}
