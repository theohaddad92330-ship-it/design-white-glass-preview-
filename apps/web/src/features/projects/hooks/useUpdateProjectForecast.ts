import type { ForecastCategory } from '@bellum/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi, projectQueryKeys } from '../api'

/**
 * Les deux déclarations que le commercial pose sur une opportunité, depuis la
 * fiche OU depuis la table d'inspection de `/pilotage/pipe` : la catégorie
 * déclarée et la date de signature prévue. Une seule porte d'écriture web
 * (GA-26) — deux écrans, un seul appelant du serveur.
 *
 * Invalidation plutôt qu'écriture optimiste, comme `useUpdateProjectOwner` :
 * la mutation est rare, et la table du pipe se relit pour ses totaux et ses
 * signaux (qui dépendent de la date et de la catégorie qu'on vient de changer).
 */
function useInvalidateAfterWrite() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: projectQueryKeys.all })
    void queryClient.invalidateQueries({ queryKey: ['pilotage', 'pipe'] })
  }
}

export function useUpdateForecastCategory() {
  const invalidate = useInvalidateAfterWrite()
  return useMutation({
    mutationFn: ({ id, category }: { id: string; category: ForecastCategory | null }) =>
      projectsApi.updateForecastCategory(id, category),
    onSuccess: invalidate,
  })
}

export function useUpdateCloseDate() {
  const invalidate = useInvalidateAfterWrite()
  return useMutation({
    mutationFn: ({ id, date }: { id: string; date: string | null }) => projectsApi.updateCloseDate(id, date),
    onSuccess: invalidate,
  })
}
