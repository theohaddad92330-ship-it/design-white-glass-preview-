import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { myPlanActionsKey } from '@/features/actions/hooks/useMyPlanActions'
import { actionOsKeys } from '@/features/action-os/api'

/**
 * #4418.1 — « Marquer envoyé » : le commercial a envoyé le message LUI-MÊME. Déclaratif — aucune
 * preuve d'envoi. Le serveur planifie les relances J+3/J+6/J+9 depuis le jour DÉCLARÉ (`sentOn`) ; on relit donc la file
 * « Aujourd'hui » (même ligne, jamais une copie) et la cadence du contact.
 */
export function useDeclareSent(contactId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, { channel: 'email' | 'linkedin'; sentOn?: string }>({
    mutationKey: ['contacts', 'declare-sent', contactId],
    mutationFn: ({ channel, sentOn }) =>
      sentOn ? contactsApi.declareSent(contactId, channel, sentOn) : contactsApi.declareSent(contactId, channel),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: contactKeys.cadence(contactId) })
      void qc.invalidateQueries({ queryKey: myPlanActionsKey })
      void qc.invalidateQueries({ queryKey: actionOsKeys.actions })
    },
    onError: () => toast.error(i18n.t('engagement:message.markSent.error')),
  })
}
