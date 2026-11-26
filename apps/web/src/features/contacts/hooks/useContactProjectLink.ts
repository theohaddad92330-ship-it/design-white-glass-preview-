import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { ProjectContactRole } from '@bellum/contracts'
import { contactKeys } from '@/features/contacts/api'
import { apiFetch } from '@/lib/api'

/**
 * #3712.5 — « Associer » une personne à un projet DEPUIS sa fiche, et défaire.
 *
 * Aucune route neuve : c'est le parcours de rattachement existant du projet
 * (`PUT|DELETE /projects/:id/contacts/:contactId`, `records:write`, le contact
 * doit appartenir au compte du projet). Un second chemin d'écriture créerait
 * deux vérités sur « qui est sur l'affaire ». Le geste est réversible
 * (`unlink`) et ne touche à aucun échange passé : il écrit `project_contacts`,
 * rien d'autre. Fiche, comité du projet et recommandations relisent la même ligne.
 */
export function useContactProjectLink(contactId: string) {
  const queryClient = useQueryClient()
  const refresh = (projectId: string) => {
    void queryClient.invalidateQueries({ queryKey: contactKeys.associations(contactId) })
    void queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'contacts'] })
  }
  const link = useMutation({
    mutationFn: ({ projectId, role }: { projectId: string; role: ProjectContactRole }) =>
      apiFetch<void, { role: ProjectContactRole }>({
        path: `/projects/${projectId}/contacts/${contactId}`,
        method: 'PUT',
        body: { role },
      }),
    onSuccess: (_data, { projectId }) => refresh(projectId),
  })
  const unlink = useMutation({
    mutationFn: ({ projectId }: { projectId: string }) =>
      apiFetch<void>({ path: `/projects/${projectId}/contacts/${contactId}`, method: 'DELETE' }),
    onSuccess: (_data, { projectId }) => refresh(projectId),
  })
  return { link, unlink }
}
