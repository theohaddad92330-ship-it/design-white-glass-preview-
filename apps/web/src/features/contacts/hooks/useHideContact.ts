import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Contact } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { accountKeys } from '@/features/accounts/api'
import { contactAccountQueryKeys } from '@/features/contacts/lib/contactAccountKeys'
import { contactKeys, contactsApi } from '@/features/contacts/api'

type HideContactInput = {
  contact: Pick<Contact, 'id' | 'account_id' | 'full_name'>
  hidden: boolean
  /** Optional side effect once the contact is hidden (e.g. navigate back to the
   *  list, since a hidden contact drops out of it). */
  onHidden?: () => void
}

/**
 * Soft-hide (or un-hide) a contact from the default list (Théo P0 « Fiche
 * contact » : masquer). Invalidates the list so the row disappears, and runs
 * `onHidden` so the caller can navigate away from the now-hidden detail page.
 */
export function useHideContact() {
  const qc = useQueryClient()

  return useMutation<Contact, Error, HideContactInput>({
    mutationKey: ['contacts', 'hidden'],
    mutationFn: ({ contact, hidden }) => contactsApi.setHidden(contact.id, hidden),
    onSuccess: (updated, { contact, hidden, onHidden }) => {
      qc.setQueryData<Contact>(contactKeys.detail(updated.id), current =>
        current ? { ...current, hidden: updated.hidden } : current,
      )
      qc.invalidateQueries({ queryKey: contactKeys.list })
      // #1473 — sans compte, il n'y a rien à rafraîchir de ce côté.
      for (const key of contactAccountQueryKeys(contact.account_id))
        qc.invalidateQueries({ queryKey: key, refetchType: 'inactive' })
      toast.success(
        hidden
          ? i18n.t('contacts:hide.hidden', { name: contact.full_name })
          : i18n.t('contacts:hide.shown', { name: contact.full_name }),
      )
      onHidden?.()
    },
    onError: (_error, { hidden }) => {
      toast.error(hidden ? i18n.t('contacts:hide.hideError') : i18n.t('contacts:hide.showError'))
    },
  })
}
