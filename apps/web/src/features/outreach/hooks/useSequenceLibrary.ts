import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  ApplySequenceTemplateResult,
  ContentVisibility,
  ImportSequenceLibraryRequest,
  ImportSequenceLibraryResult,
  SequenceTemplate,
} from '@bellum/contracts'
import { outreachKeys } from '@/features/outreach/api'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #3756 — la bibliothèque de modèles de séquence. Importer ou appliquer un
 * modèle PRÉPARE : aucune route n'envoie (le commercial envoie, « Fait » reste
 * déclaratif).
 */
const libraryKey = ['outreach', 'sequence-templates'] as const

export function useSequenceTemplates() {
  const { user } = useSession()
  return useQuery<SequenceTemplate[]>({
    queryKey: libraryKey,
    queryFn: () => apiFetch<SequenceTemplate[]>({ path: '/outreach/sequence-templates' }),
    enabled: !!user,
  })
}

export function useImportSequenceLibrary() {
  const qc = useQueryClient()
  return useMutation<ImportSequenceLibraryResult, Error, ImportSequenceLibraryRequest>({
    mutationFn: body =>
      apiFetch<ImportSequenceLibraryResult, ImportSequenceLibraryRequest>({
        path: '/outreach/sequence-templates/import',
        method: 'POST',
        body,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: libraryKey }),
  })
}

export function useDeleteSequenceTemplate() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: id => apiFetch<void>({ path: `/outreach/sequence-templates/${id}`, method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: libraryKey }),
  })
}

/** #4158.30 — l'auteur partage son modèle avec l'équipe, ou le reprend en personnel. */
export function useSetSequenceTemplateVisibility() {
  const qc = useQueryClient()
  return useMutation<SequenceTemplate, Error, { id: string; visibility: ContentVisibility }>({
    mutationFn: ({ id, visibility }) =>
      apiFetch<SequenceTemplate, { visibility: ContentVisibility }>({
        path: `/outreach/sequence-templates/${id}/visibility`,
        method: 'PATCH',
        body: { visibility },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: libraryKey }),
  })
}

export function useApplySequenceTemplate() {
  const qc = useQueryClient()
  return useMutation<ApplySequenceTemplateResult, Error, { templateId: string; contactId: string }>({
    mutationFn: ({ templateId, contactId }) =>
      apiFetch<ApplySequenceTemplateResult, { contact_id: string }>({
        path: `/outreach/sequences/from-template/${templateId}`,
        method: 'POST',
        body: { contact_id: contactId },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: outreachKeys.all }),
  })
}
