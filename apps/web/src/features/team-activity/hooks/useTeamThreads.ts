import { useMutation, useQueryClient } from '@tanstack/react-query'
import { teamCommentKeys, teamCommentsApi } from '@/features/manager/api'

/** Résoudre (ou rouvrir) la racine d'un sujet d'équipe, puis relire le fil. */
export function useResolveTeamTopic() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, resolved }: { id: string; resolved: boolean }) => teamCommentsApi.setResolution(id, resolved),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: teamCommentKeys.all })
    },
  })
}
