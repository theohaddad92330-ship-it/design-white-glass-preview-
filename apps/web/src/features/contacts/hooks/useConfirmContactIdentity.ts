import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { contactKeys, contactsApi } from '@/features/contacts/api'

/**
 * #2160.58 — déclarer la confirmation positive « bon contact », symétrique du
 * refus (`useRecordContactStop`). Idempotent : rien n'est patché
 * optimistiquement, la fiche relit le fait posé par le serveur.
 */
export function useConfirmContactIdentity(contactId: string) {
  const qc = useQueryClient()

  return useMutation<Contact, Error, void>({
    mutationKey: ['contacts', 'identity-confirmed', contactId],
    mutationFn: () => contactsApi.confirmIdentity(contactId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: contactKeys.detail(contactId) })
      toast.success(i18n.t('contacts:corrections.confirmDone'))
    },
    onError: () => toast.error(i18n.t('contacts:corrections.confirmError')),
  })
}
