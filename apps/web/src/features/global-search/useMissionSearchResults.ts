import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { missionsApi } from '@/features/missions/api'
import { GLOBAL_SEARCH_MIN_QUERY_LENGTH, GLOBAL_SEARCH_RESULT_LIMIT } from './constants'

/**
 * #2207.72 — recherche : mission.
 *
 * Aucun `q` côté serveur : `MissionListFilters` (`missions/api.ts`) ne porte
 * que `accountId`/`consultantId`/`id`/`scope`. `/missions` lui-même charge
 * `missionsApi.list({ accountId, consultantId })` SANS pagination (
 * `MissionsPage.tsx`) — la liste ENTIÈRE de l'espace, déjà. La recherche
 * globale réutilise donc le même appel, sans filtre, et FILTRE CÔTÉ CLIENT sur
 * ce qui est déjà là plutôt que d'ajouter une route serveur pour reproduire ce
 * que l'écran fait déjà.
 *
 * La requête réseau ne dépend PAS de la saisie (clé stable) : retaper une
 * lettre ne refait pas l'aller-retour, seul le filtre en mémoire change.
 */
export function useMissionSearchResults(query: string) {
  const trimmed = query.trim().toLowerCase()
  const enabled = trimmed.length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH
  const missions = useQuery({
    queryKey: ['global-search', 'missions'],
    queryFn: () => missionsApi.list({}),
    enabled,
    staleTime: 30_000,
  })

  return useMemo(() => {
    if (!enabled || !missions.data) return []
    return missions.data.missions
      .filter(
        mission =>
          mission.label.toLowerCase().includes(trimmed) || (mission.accountName ?? '').toLowerCase().includes(trimmed),
      )
      .slice(0, GLOBAL_SEARCH_RESULT_LIMIT)
  }, [enabled, missions.data, trimmed])
}
