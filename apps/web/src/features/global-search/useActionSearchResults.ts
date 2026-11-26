import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { planItemsApi } from '@/features/actions/planItems.api'
import { GLOBAL_SEARCH_MIN_QUERY_LENGTH, GLOBAL_SEARCH_RESULT_LIMIT } from './constants'

/**
 * #2207.73 — recherche : action.
 *
 * `planItemsApi.mine()` — MES actions ouvertes tous comptes confondus, « pour
 * l'écran `/actions` » (le commentaire du fichier source le dit littéralement) —
 * `GET /plan-items/mine`, sans critère de texte. Même mécanique que les
 * missions (#2207.72) : une requête réseau à clé STABLE, un filtre en mémoire
 * qui n'en refait aucune à chaque lettre tapée.
 */
export function useActionSearchResults(query: string) {
  const trimmed = query.trim().toLowerCase()
  const enabled = trimmed.length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH
  const actions = useQuery({
    queryKey: ['global-search', 'actions'],
    queryFn: () => planItemsApi.mine(),
    enabled,
    staleTime: 30_000,
  })

  return useMemo(() => {
    if (!enabled || !actions.data) return []
    return actions.data
      .filter(
        action =>
          action.label.toLowerCase().includes(trimmed) || (action.company_name ?? '').toLowerCase().includes(trimmed),
      )
      .slice(0, GLOBAL_SEARCH_RESULT_LIMIT)
  }, [enabled, actions.data, trimmed])
}
