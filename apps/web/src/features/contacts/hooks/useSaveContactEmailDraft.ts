import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Contact, ContactEmailDraftMailbox } from '@bellum/contracts'
import { contactKeys, contactsApi } from '@/features/contacts/api'

/**
 * #3942.2 — « Préparer un e-mail par personne » : enregistre le brouillon
 * personnalisé d'UN contact sans l'envoyer. Statut préparé, jamais envoyé.
 */
export function useSaveContactEmailDraft() {
  const qc = useQueryClient()
  return useMutation<
    Contact & { mailbox_draft?: ContactEmailDraftMailbox },
    Error,
    { id: string; subject?: string; body: string }
  >({
    mutationFn: ({ id, subject, body }) => contactsApi.saveEmailDraft(id, { subject, body }),
    onSuccess: contact => {
      qc.invalidateQueries({ queryKey: contactKeys.detail(contact.id) })
      qc.invalidateQueries({ queryKey: contactKeys.list })
    },
  })
}
