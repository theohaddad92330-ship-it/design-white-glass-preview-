import type {
  NoteScopeAccount,
  AccountCorePatch,
  Contact,
  ContactCorePatch,
  CreateContactInput,
  CreateNoteInput,
  Note,
  NoteEntityType,
  RecordFieldAudit,
  RecordImportMark,
  RecordPatchResult,
  UpdateNoteInput,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

/** Clés de cache — une par objet annoté, pour qu'une note ajoutée sur un
 *  contact ne recharge pas les notes d'un compte. */
export const crmKeys = {
  notes: (entityType: NoteEntityType, entityId: string) => ['crm', 'notes', entityType, entityId] as const,
  history: (entityType: NoteEntityType, entityId: string) => ['crm', 'history', entityType, entityId] as const,
}

export const notesApi = {
  list(entityType: NoteEntityType, entityId: string): Promise<{ items: Note[] }> {
    return apiFetch<{ items: Note[] }>({ path: `/notes?entityType=${entityType}&entityId=${entityId}` })
  },
  /** #3895 — les autres entités du groupe d'un compte : où une note peut aussi valoir. */
  groupEntities(accountId: string): Promise<{ items: NoteScopeAccount[] }> {
    return apiFetch<{ items: NoteScopeAccount[] }>({ path: `/notes/group-entities/${accountId}` })
  },
  create(input: CreateNoteInput): Promise<Note> {
    return apiFetch<Note, CreateNoteInput>({ path: '/notes', method: 'POST', body: input })
  },
  update(id: string, input: UpdateNoteInput): Promise<Note> {
    return apiFetch<Note, UpdateNoteInput>({ path: `/notes/${id}`, method: 'PATCH', body: input })
  },
  remove(id: string): Promise<void> {
    return apiFetch<void>({ path: `/notes/${id}`, method: 'DELETE' })
  },
}

export const recordsApi = {
  patchAccount(id: string, patch: AccountCorePatch): Promise<RecordPatchResult> {
    return apiFetch<RecordPatchResult, AccountCorePatch>({ path: `/accounts/${id}`, method: 'PATCH', body: patch })
  },
  patchContact(id: string, patch: ContactCorePatch): Promise<RecordPatchResult> {
    return apiFetch<RecordPatchResult, ContactCorePatch>({ path: `/contacts/${id}`, method: 'PATCH', body: patch })
  },
  createContact(input: CreateContactInput): Promise<Contact> {
    return apiFetch<Contact, CreateContactInput>({ path: '/contacts', method: 'POST', body: input })
  },
  deleteContact(id: string): Promise<{ deletedAt: string }> {
    return apiFetch<{ deletedAt: string }>({ path: `/contacts/${id}`, method: 'DELETE' })
  },
  restoreContact(id: string): Promise<void> {
    return apiFetch<void>({ path: `/contacts/${id}/restore`, method: 'POST' })
  },
  history(
    entityType: 'account' | 'contact' | 'mission',
    id: string,
  ): Promise<{ items: RecordFieldAudit[]; importedFrom?: RecordImportMark | null }> {
    // #2193.50 (épopée #2953) — la mission n'a pas de ressource REST `/missions`
    // au premier niveau (tout vit sous `delivery/missions/:id/...`) ; les deux
    // autres types gardent leur chemin générique `/${entityType}s/:id/history`.
    const path = entityType === 'mission' ? `/delivery/missions/${id}/history` : `/${entityType}s/${id}/history`
    return apiFetch<{ items: RecordFieldAudit[]; importedFrom?: RecordImportMark | null }>({ path })
  },
}
