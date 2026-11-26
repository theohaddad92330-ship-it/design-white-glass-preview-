import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { UpsertMemberObjective } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { objectiveKeys, objectivesApi } from '../api'
import { useTeamMonth } from './team-month'

/**
 * L'atteinte de l'équipe pour le mois (cockpit manager §10). Réservé aux managers
 * côté serveur (403 sinon) ; le cockpit ne s'affiche déjà qu'aux owner/admin.
 */
export function useTeamObjectives(requestedMonth?: string) {
  const { user } = useSession()
  // Le mois choisi dans le filtre de la page, sauf si l'appelant en demande un précis.
  const contextMonth = useTeamMonth()
  const month = requestedMonth ?? contextMonth
  return useQuery({
    queryKey: objectiveKeys.team(user?.id, month),
    queryFn: () => objectivesApi.team(month),
    enabled: !!user,
    staleTime: 60_000,
  })
}

/** L'objectif du membre courant pour le mois (courant par défaut). */
export function useMyObjective(month?: string) {
  const { user } = useSession()
  return useQuery({
    queryKey: objectiveKeys.mine(user?.id, month),
    queryFn: () => objectivesApi.mine(month),
    enabled: !!user,
    staleTime: 60_000,
  })
}

/**
 * Déclarer / mettre à jour l'objectif du membre. Invalide l'objectif perso ET
 * l'atteinte d'équipe pour que le cockpit reflète la nouvelle cible.
 */
export function useUpsertMyObjective() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: UpsertMemberObjective) => objectivesApi.upsertMine(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: objectiveKeys.all })
    },
  })
}
