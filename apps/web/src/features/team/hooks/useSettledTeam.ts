import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useSession } from '@/lib/hooks/use-session'
import { teamApi } from '../api'

export const TEAM_KEY = ['workspace-team'] as const

/**
 * #4630 — l'instant où CE chargement de page a commencé. Une réponse d'équipe plus
 * ancienne vient du cache persisté (IndexedDB), pas du serveur.
 *
 * Constat de recette du 26/10/2026 : après un changement d'espace, un membre voyait
 * l'onglet Imports et des entrées de gestionnaire le temps d'un rendu. Le changement
 * d'espace recharge la page, mais le nettoyage IndexedDB est « au mieux » : le cache
 * ressuscitait la réponse de l'espace PRÉCÉDENT, rôle compris. Une réponse restaurée
 * ne décide donc de rien (ni le rôle, ni la liste des membres) tant que le serveur
 * n'a pas répondu pour l'espace COURANT. Le droit côté serveur n'a jamais été en cause.
 */
const PAGE_LOADED_AT = Date.now()

/**
 * LA porte de lecture de l'équipe de l'espace actif — la seule qui rende un rôle (#4630,
 * voir `PAGE_LOADED_AT`). `useTeam` et `useUserPermissions` (`lib/permissions.ts`) passent
 * toutes deux par elle ; la garde `un-role-perime-ne-decide-pas` interdit toute autre.
 */
export function useSettledTeam(options: { enabled?: boolean } = {}) {
  const { user } = useSession()
  const query = useQuery({
    queryKey: TEAM_KEY,
    queryFn: () => teamApi.getTeam(),
    enabled: !!user && (options.enabled ?? true),
    staleTime: 30_000,
  })
  // Tant que la réponse date d'avant ce chargement de page, on ne SAIT pas.
  const settled = query.dataUpdatedAt >= PAGE_LOADED_AT
  const awaitingCurrentWorkspace = query.data !== undefined && !settled && !query.isError
  // #5170 : une réponse restaurée du cache persisté de moins de `staleTime` n'est pas périmée, donc
  // aucun refetch ne part et l'attente ne finit jamais. On force UN refetch si rien ne tourne.
  const { isFetching, refetch } = query
  useEffect(() => {
    if (awaitingCurrentWorkspace && !isFetching) void refetch()
  }, [awaitingCurrentWorkspace, isFetching, refetch])
  return {
    team: settled ? query.data : undefined,
    isLoading: query.isLoading || awaitingCurrentWorkspace,
    isError: query.isError,
  }
}
