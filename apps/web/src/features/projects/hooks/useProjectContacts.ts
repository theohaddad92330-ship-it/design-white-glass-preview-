import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ProjectContact, ProjectContactRole } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

const contactsKey = (projectId: string) => ['projects', projectId, 'contacts'] as const

/**
 * #2171.5 (lot W20) — LES CONTACTS DE L'OPPORTUNITÉ, avec leur rôle SUR CE
 * PROJET (sponsor, décideur, prescripteur, acheteur, utilisateur, bloqueur).
 *
 * `GET /projects/:id/contacts` existait déjà côté API (`ProjectPipelineService
 * .listContacts`, `projects.controller.ts`) — rattacher/détacher un contact
 * fonctionnait, et AUCUN écran ne le lisait. C'est le défaut n°1 du dépôt : du
 * code juste que personne n'appelle.
 */
export function useProjectContacts(projectId: string) {
  return useQuery({
    queryKey: contactsKey(projectId),
    queryFn: () => apiFetch<{ items: ProjectContact[] }>({ path: `/projects/${projectId}/contacts` }),
    select: response => response.items,
  })
}

/**
 * #2171.31 — RATTACHER un contact du compte à CETTE opportunité, avec son
 * rôle SUR CE PROJET. `PUT /projects/:id/contacts/:contactId` existait déjà
 * côté API (voir le docblock de `useProjectContacts`) : ce hook est le
 * premier appelant côté écran.
 */
export function useLinkProjectContact(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ contactId, role }: { contactId: string; role: ProjectContactRole }) =>
      apiFetch<void, { role: ProjectContactRole }>({
        path: `/projects/${projectId}/contacts/${contactId}`,
        method: 'PUT',
        body: { role },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: contactsKey(projectId) }),
  })
}
