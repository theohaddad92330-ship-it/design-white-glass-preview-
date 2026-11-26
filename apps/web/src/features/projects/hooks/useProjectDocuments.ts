import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateProjectDocumentInput, ProjectDocumentStatus } from '@bellum/contracts'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { projectsApi, projectQueryKeys } from '../api'

/**
 * #2171.24 — Section « Documents » de la fiche opportunité — LECTURE. Suivi
 * au niveau de L'AFFAIRE, distinct de `useNeedDocuments` (un rôle précis).
 * Voir le docblock de `ProjectDocumentsService` (API) : aucun fichier joint
 * dans cette tranche.
 */
export function useProjectDocuments(projectId: string) {
  const query = useQuery({
    queryKey: projectQueryKeys.documents(projectId),
    queryFn: () => projectsApi.listDocuments(projectId),
    enabled: projectId.length > 0,
  })
  return {
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}

/** Suit un document neuf, en brouillon. */
export function useCreateProjectDocument(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateProjectDocumentInput) => projectsApi.createDocument(projectId, input),
    onSuccess: () => void qc.invalidateQueries({ queryKey: projectQueryKeys.documents(projectId) }),
    onError: (error: Error) => toast.error(error.message || i18n.t('projects:detail.documents.createError')),
  })
}

/** Fait avancer un document : envoyé, en attente, signé, refusé. */
export function useUpdateProjectDocumentStatus(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ documentId, status }: { documentId: string; status: ProjectDocumentStatus }) =>
      projectsApi.updateDocumentStatus(projectId, documentId, status),
    onSuccess: () => void qc.invalidateQueries({ queryKey: projectQueryKeys.documents(projectId) }),
    onError: (error: Error) => toast.error(error.message || i18n.t('projects:detail.documents.updateError')),
  })
}
