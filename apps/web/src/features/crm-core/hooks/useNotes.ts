import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Note, NoteEntityType, NoteScopeAccount } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { crmKeys, notesApi } from '../api'

/** Les notes d'un objet, épinglées d'abord puis antéchronologiques. */
export function useNotes(entityType: NoteEntityType, entityId: string | undefined) {
  return useQuery({
    queryKey: crmKeys.notes(entityType, entityId ?? 'none'),
    queryFn: () => notesApi.list(entityType, entityId as string),
    enabled: Boolean(entityId),
    select: response => response.items,
  })
}

/** #3895 — les autres entités du groupe d'un compte (vide pour tout autre objet : pas de requête). */
export function useGroupEntities(entityType: NoteEntityType, entityId: string | undefined) {
  return useQuery({
    queryKey: [...crmKeys.notes(entityType, entityId ?? 'none'), 'group-entities'] as const,
    queryFn: () => notesApi.groupEntities(entityId as string),
    enabled: entityType === 'account' && Boolean(entityId),
    select: (response: { items: NoteScopeAccount[] }) => response.items,
  })
}

export function useCreateNote(entityType: NoteEntityType, entityId: string) {
  const qc = useQueryClient()
  return useMutation<Note, Error, { body: string; alsoAppliesToAccountIds?: string[] }>({
    mutationFn: ({ body, alsoAppliesToAccountIds }) =>
      notesApi.create({ entityType, entityId, body, ...(alsoAppliesToAccountIds ? { alsoAppliesToAccountIds } : {}) }),
    onSuccess: (_note, variables) => {
      qc.invalidateQueries({ queryKey: crmKeys.notes(entityType, entityId) })
      // #3895 — la note vaut aussi pour d'autres comptes : leurs fils se relisent.
      if (variables.alsoAppliesToAccountIds?.length) qc.invalidateQueries({ queryKey: ['crm', 'notes', 'account'] })
      toast.success(i18n.t('crm:notes.added'))
    },
    onError: () => toast.error(i18n.t('crm:notes.addError')),
  })
}

export function useUpdateNote(entityType: NoteEntityType, entityId: string) {
  const qc = useQueryClient()
  return useMutation<Note, Error, { id: string; body?: string; pinned?: boolean; alsoAppliesToAccountIds?: string[] }>({
    mutationFn: ({ id, body, pinned, alsoAppliesToAccountIds }) =>
      notesApi.update(id, { body, pinned, ...(alsoAppliesToAccountIds ? { alsoAppliesToAccountIds } : {}) }),
    onSuccess: (_note, variables) => {
      qc.invalidateQueries({ queryKey: crmKeys.notes(entityType, entityId) })
      // #3895.1 — la portée change : les fils des AUTRES entités du groupe se relisent.
      if (variables.alsoAppliesToAccountIds) qc.invalidateQueries({ queryKey: ['crm', 'notes', 'account'] })
    },
    onError: () => toast.error(i18n.t('crm:notes.saveError')),
  })
}

export function useDeleteNote(entityType: NoteEntityType, entityId: string) {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string }>({
    mutationFn: ({ id }) => notesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: crmKeys.notes(entityType, entityId) })
      toast.success(i18n.t('crm:notes.deleted'))
    },
    onError: () => toast.error(i18n.t('crm:notes.deleteError')),
  })
}
