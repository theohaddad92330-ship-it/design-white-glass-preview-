import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useMeetingPrepAction } from '@/features/agenda/meeting-prep-proposal'
import type { CreateAccountNeed, CreateProjectNeed, ProjectNeed, UpdateProjectNeed } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { apiFetch } from '@/lib/api'

const needsKey = (projectId: string) => ['projects', projectId, 'needs'] as const

/** Les rôles recherchés d'un projet. */
export function useProjectNeeds(projectId: string) {
  return useQuery({
    queryKey: needsKey(projectId),
    queryFn: () => apiFetch<{ items: ProjectNeed[] }>({ path: `/projects/${projectId}/needs` }),
    select: response => response.items,
  })
}

export function useAddProjectNeed(projectId: string) {
  const qc = useQueryClient()
  return useMutation<ProjectNeed, Error, CreateProjectNeed>({
    mutationFn: input =>
      apiFetch<ProjectNeed, CreateProjectNeed>({
        path: `/projects/${projectId}/needs`,
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: needsKey(projectId) })
      toast.success(i18n.t('projects:needs.added'))
    },
    onError: error => toast.error(error.message || i18n.t('projects:needs.addError')),
  })
}

/**
 * #2558.1 — CRÉER UN BESOIN AU NOM D'UN COMPTE, avec ou sans projet.
 *
 * `useAddProjectNeed` ci-dessus porte le projet dans l'URL : il ne peut pas
 * décrire un besoin qui n'en a pas. Ce hook-ci vise `POST /projects/needs`, où
 * le CLIENT est dans le corps et le projet est facultatif.
 *
 * ⚠️ Les deux caches invalidés, et pas un seul : la liste des besoins DU
 * PROJET (quand il y en a un) et celle du board transverse. Un besoin sans
 * projet n'apparaît que sur la seconde — n'invalider que la première laisserait
 * l'écran vide juste après une création réussie, ce qui se lit comme un échec.
 */
export function useAddAccountNeed() {
  const qc = useQueryClient()
  const prepAction = useMeetingPrepAction()
  return useMutation<ProjectNeed, Error, CreateAccountNeed>({
    mutationFn: input =>
      apiFetch<ProjectNeed, CreateAccountNeed>({ path: '/projects/needs', method: 'POST', body: input }),
    onSuccess: (need, input) => {
      if (need.project_id) qc.invalidateQueries({ queryKey: needsKey(need.project_id) })
      qc.invalidateQueries({ queryKey: ['open-needs'] })
      // #4424.6 — la création PROPOSE « Préparer le RDV » ; #4424.4 — il ouvre le
      // panneau R1/R2 de la fiche du compte du besoin. Rien ne part seul.
      toast.success(i18n.t('projects:needs.added'), { action: prepAction(input.account_id) })
    },
    onError: error => toast.error(error.message || i18n.t('projects:needs.addError')),
  })
}

export function useUpdateProjectNeed(projectId: string) {
  const qc = useQueryClient()
  return useMutation<ProjectNeed, Error, { needId: string; patch: UpdateProjectNeed }>({
    mutationFn: ({ needId, patch }) =>
      apiFetch<ProjectNeed, UpdateProjectNeed>({ path: `/projects/needs/${needId}`, method: 'PATCH', body: patch }),
    onSuccess: () => qc.invalidateQueries({ queryKey: needsKey(projectId) }),
    onError: error => toast.error(error.message || i18n.t('projects:needs.saveError')),
  })
}

export function useRemoveProjectNeed(projectId: string) {
  const qc = useQueryClient()
  return useMutation<void, Error, { needId: string }>({
    mutationFn: ({ needId }) => apiFetch<void>({ path: `/projects/needs/${needId}`, method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: needsKey(projectId) })
      toast.success(i18n.t('projects:needs.removed'))
    },
    onError: error => toast.error(error.message || i18n.t('projects:needs.removeError')),
  })
}
