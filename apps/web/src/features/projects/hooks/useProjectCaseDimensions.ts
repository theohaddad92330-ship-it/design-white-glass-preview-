import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { projectsApi, projectQueryKeys, type CaseDimensionsPatch } from '../api'

/** #3246 — lecture des trois choix fermés (stratégie, modèle d'achat, organisation) d'une affaire. */
export function useProjectCaseDimensions(projectId: string) {
  return useQuery({
    queryKey: projectQueryKeys.caseDimensions(projectId),
    queryFn: () => projectsApi.readCaseDimensions(projectId),
    enabled: projectId.length > 0,
  })
}

/** #3246 — écriture d'un seul champ à la fois ; la réponse serveur devient la vérité affichée. */
export function useSaveProjectCaseDimensions() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: CaseDimensionsPatch }) =>
      projectsApi.updateCaseDimensions(id, patch),
    onSuccess: (data, { id }) => {
      queryClient.setQueryData(projectQueryKeys.caseDimensions(id), data)
    },
  })
}
