import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateTeamComment } from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { teamCommentKeys, teamCommentsApi } from '../api'

/** Le fil de commentaires d'équipe de l'espace (cockpit manager §10). */
export function useTeamComments() {
  const { user } = useSession()
  return useQuery({
    queryKey: teamCommentKeys.list(user?.id),
    queryFn: () => teamCommentsApi.list(),
    enabled: !!user,
    staleTime: 30_000,
  })
}

/** Partager une idée / un commentaire, puis rafraîchir le fil. */
export function useCreateTeamComment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: CreateTeamComment) => teamCommentsApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamCommentKeys.all })
    },
  })
}

/**
 * Théo D team-activite — « Marquer résolu » / « Rouvrir » sur un sujet d'équipe. La MÊME porte
 * d'écriture que le fil du compte (`teamCommentsApi.setResolution`, `PATCH /team-comments/:id/resolution`),
 * seule l'invalidation diffère : ici, la liste de l'espace Équipe.
 */
export function useSetTeamCommentResolution() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) => teamCommentsApi.setResolution(id, resolved),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamCommentKeys.all })
    },
  })
}
