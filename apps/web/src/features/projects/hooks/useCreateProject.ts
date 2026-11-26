import type { CreateProject } from '@bellum/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { projectsApi, projectQueryKeys } from '../api'

/**
 * #2195.33 — OUVRIR UNE AFFAIRE.
 *
 * Invalidation plutôt qu'écriture optimiste : une création est rare, et une
 * affaire affichée avant que la base l'ait acceptée disparaîtrait sous les yeux
 * de celui qui vient de la saisir.
 *
 * ⚠️ Ce hook n'est monté que par le FORMULAIRE de création. Aucun effet, aucune
 * routine, aucun outil du copilote ne l'appelle : une écriture CRM passe par
 * une porte, et celle-ci est un clic.
 */
export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (body: CreateProject) => projectsApi.create(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: projectQueryKeys.all })
      // Le pipe valorisé et la liste des renouvellements lisent tous deux ce
      // que la création vient d'ajouter.
      void queryClient.invalidateQueries({ queryKey: ['missions'] })
    },
  })
}
