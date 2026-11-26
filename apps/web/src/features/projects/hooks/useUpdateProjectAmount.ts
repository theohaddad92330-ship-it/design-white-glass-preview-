import { useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi, projectQueryKeys } from '../api'

/**
 * Saisir/effacer le montant d'affaire estimé d'une opportunité (cockpit manager
 * §10 — pipeline valorisé). Invalide la liste des opportunités ET les stats
 * manager, pour que le détail du besoin ET le bloc « Pipeline partagé » reflètent
 * le nouveau montant. Invalidation plutôt qu'écriture optimiste : la mutation est
 * rare et les listes sont petites.
 */
export function useUpdateProjectAmount() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number | null }) => projectsApi.updateAmount(id, amount),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectQueryKeys.all })
      // Le pipeline valorisé du cockpit dérive de ces montants.
      void queryClient.invalidateQueries({ queryKey: ['manager', 'team-stats'] })
    },
  })
}
