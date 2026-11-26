import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { openNeedsKeys, rfpNeedPreviewApi } from '../api'

/**
 * #2571.2 — la prévisualisation d'un besoin proposé depuis un appel d'offres.
 *
 * Une LECTURE (`GET /rfp/:id/need-preview`) : rien n'existe tant que
 * `confirm` n'a pas été appelé explicitement, avec un projet choisi par
 * l'utilisateur. `enabled` sur un `rfpId` non vide, comme `useOpenNeed` — un
 * identifiant absent dans une URL abîmée ouvre l'écran sans panneau plutôt
 * qu'une page en erreur.
 */
export function useRfpNeedPreview(rfpId: string | undefined) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: ['rfp-need-preview', rfpId] as const,
    queryFn: () => rfpNeedPreviewApi.preview(rfpId as string),
    enabled: !!rfpId,
  })

  const confirm = useMutation({
    mutationFn: (projectId: string) => rfpNeedPreviewApi.confirm(rfpId as string, projectId),
    onSuccess: () => {
      // Le besoin vient d'être ÉCRIT : la liste transverse doit le voir sans
      // attendre le prochain montage de l'écran.
      void queryClient.invalidateQueries({ queryKey: openNeedsKeys.all })
    },
  })

  return {
    preview: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    confirm,
  }
}
