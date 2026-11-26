import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateProjectStepInput, ProjectStepStatus } from '@bellum/contracts'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { projectsApi, projectQueryKeys } from '../api'

/**
 * #2171.22 — Section « Actions et prochaines étapes » de la fiche opportunité,
 * COCHABLE — LECTURE. Distincte de `ProjectRow.next_action` (une dérivation
 * non persistée qui reste à côté). Même mécanisme que `useNeedSteps`.
 */
export function useProjectSteps(projectId: string) {
  const query = useQuery({
    queryKey: projectQueryKeys.steps(projectId),
    queryFn: () => projectsApi.listSteps(projectId),
    enabled: projectId.length > 0,
  })
  return {
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

/** Cocher, décocher, ou marquer « en attente ». */
export function useUpdateProjectStep(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ stepId, status }: { stepId: string; status: ProjectStepStatus }) =>
      projectsApi.updateStep(projectId, stepId, { status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: projectQueryKeys.steps(projectId) }),
    onError: (error: Error) => toast.error(error.message || i18n.t('projects:detail.steps.updateError')),
  })
}

/** Ajouter une étape. */
export function useCreateProjectStep(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateProjectStepInput) => projectsApi.createStep(projectId, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: projectQueryKeys.steps(projectId) }),
    onError: (error: Error) => toast.error(error.message || i18n.t('projects:detail.steps.createError')),
  })
}
