import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { projectsApi, projectQueryKeys } from '../api'

/**
 * #2171.39 — ARCHIVER / DÉSARCHIVER l'opportunité, un rangement NEUTRE (même
 * doctrine que `project_needs.archived_at`) : `stage`/`outcome` ne bougent
 * pas, seul `archived_at` change. Le serveur refuse (400) une opportunité
 * déjà dans l'état demandé plutôt que de réussir en silence — le toast
 * d'erreur porte alors ce message serveur tel quel, jamais un « échec »
 * générique qui ferait croire à une panne.
 */
export function useArchiveOpportunity() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      archived ? projectsApi.archiveOpportunity(id) : projectsApi.unarchiveOpportunity(id),
    onSuccess: (_row, { archived }) => {
      toast.success(archived ? i18n.t('projects:detail.archived') : i18n.t('projects:detail.unarchived'))
      // #4137 — le kanban (`['opportunities','list']`) et la fiche (`byId`) vivent HORS de `['projects']` : sans cette
      // seconde racine la carte archivée restait au kanban. `all` couvre « Archivées » et le compteur.
      void qc.invalidateQueries({ queryKey: projectQueryKeys.all })
      void qc.invalidateQueries({ queryKey: projectQueryKeys.opportunities })
    },
    onError: (err: Error) => toast.error(err.message || i18n.t('projects:detail.archiveError')),
  })
}
