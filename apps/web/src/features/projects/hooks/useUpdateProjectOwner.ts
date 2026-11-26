import { useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi, projectQueryKeys } from '../api'

/**
 * #2170.26 — Attribuer (ou retirer, avec `null`) le porteur d'une opportunité
 * depuis le pipe. Invalidation plutôt qu'écriture optimiste : même choix que
 * `useUpdateProjectStage`/`useUpdateProjectAmount` — la mutation est rare et
 * la liste est petite.
 */
export function useUpdateProjectOwner() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, ownerId }: { id: string; ownerId: string | null }) => projectsApi.updateOwner(id, ownerId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectQueryKeys.all })
    },
  })
}
