import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type {
  AccountCorePatch,
  Contact,
  ContactCorePatch,
  CreateContactInput,
  RecordPatchResult,
} from '@bellum/contracts'
import { i18n } from '@/i18n'
import { accountKeys } from '@/features/accounts/api'
import { contactAccountQueryKeys } from '@/features/contacts/lib/contactAccountKeys'
import { contactKeys } from '@/features/contacts/api'
import { crmKeys, recordsApi } from '../api'

/**
 * Corriger un champ de la fiche COMPTE.
 *
 * L'invalidation touche la fiche ET la liste : une raison sociale corrigée qui
 * resterait fausse dans le portefeuille donnerait l'impression que la
 * correction n'a pas pris.
 */
export function usePatchAccount(accountId: string) {
  const qc = useQueryClient()
  return useMutation<RecordPatchResult, Error, AccountCorePatch>({
    mutationFn: patch => recordsApi.patchAccount(accountId, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: accountKeys.detail(accountId) })
      qc.invalidateQueries({ queryKey: accountKeys.all })
      qc.invalidateQueries({ queryKey: crmKeys.history('account', accountId) })
      toast.success(i18n.t('crm:record.saved'))
    },
    onError: error => toast.error(error.message || i18n.t('crm:record.saveError')),
  })
}

export function usePatchContact(contact: Pick<Contact, 'id' | 'account_id'>) {
  const qc = useQueryClient()
  return useMutation<RecordPatchResult, Error, ContactCorePatch>({
    mutationFn: patch => recordsApi.patchContact(contact.id, patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contactKeys.detail(contact.id) })
      qc.invalidateQueries({ queryKey: contactKeys.all })
      // #1473 — un contact à qualifier n'a pas de fiche compte à rafraîchir.
      for (const key of contactAccountQueryKeys(contact.account_id)) qc.invalidateQueries({ queryKey: key })
      qc.invalidateQueries({ queryKey: crmKeys.history('contact', contact.id) })
      toast.success(i18n.t('crm:record.saved'))
    },
    onError: error => toast.error(error.message || i18n.t('crm:record.saveError')),
  })
}

/**
 * Créer un contact à la main — le geste du commercial qui revient de salon.
 *
 * #1473 — `accountId` peut être `null` : le contact est alors « à qualifier »,
 * et le rattachement se fera quand l'entreprise sera connue. C'est l'appelant
 * qui décide ; ici on se contente de ne pas rafraîchir une fiche qui n'existe
 * pas.
 */
export function useCreateContact(accountId: string | null) {
  const qc = useQueryClient()
  return useMutation<Contact, Error, Omit<CreateContactInput, 'accountId'>>({
    mutationFn: input => recordsApi.createContact({ ...input, accountId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contactKeys.all })
      for (const key of contactAccountQueryKeys(accountId)) qc.invalidateQueries({ queryKey: key })
      toast.success(i18n.t('crm:createContact.created'))
    },
    onError: error => toast.error(error.message || i18n.t('crm:createContact.error')),
  })
}

/**
 * Suppression réversible, avec son rattrapage dans le message même : un
 * « Supprimé » sans bouton « Annuler » oblige à recréer la fiche à la main, et
 * l'historique, lui, ne se recrée pas.
 */
export function useDeleteContact(contact: Pick<Contact, 'id' | 'account_id'>) {
  const qc = useQueryClient()
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: contactKeys.all })
    qc.invalidateQueries({ queryKey: contactKeys.detail(contact.id) })
    for (const key of contactAccountQueryKeys(contact.account_id)) qc.invalidateQueries({ queryKey: key })
  }

  return useMutation<{ deletedAt: string }, Error, void>({
    mutationFn: () => recordsApi.deleteContact(contact.id),
    onSuccess: () => {
      invalidate()
      toast.success(i18n.t('crm:delete.done'), {
        action: {
          label: i18n.t('crm:delete.undo'),
          onClick: () => {
            void recordsApi.restoreContact(contact.id).then(() => {
              invalidate()
              toast.success(i18n.t('crm:delete.restored'))
            })
          },
        },
      })
    },
    onError: error => toast.error(error.message || i18n.t('crm:delete.error')),
  })
}

/** « Qui a changé ça ? » — le journal d'écriture d'une fiche. */
export function useRecordHistory(entityType: 'account' | 'contact' | 'mission', entityId: string, enabled: boolean) {
  return useQuery({
    queryKey: crmKeys.history(entityType, entityId),
    queryFn: () => recordsApi.history(entityType, entityId),
    enabled,
    select: response => response.items,
  })
}
