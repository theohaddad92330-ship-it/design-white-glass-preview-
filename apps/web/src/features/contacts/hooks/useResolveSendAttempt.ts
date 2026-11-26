import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { SendResolution } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { contactKeys, contactsApi } from '@/features/contacts/api'

/**
 * #3699.5 — après une tentative d'envoi INCERTAINE, la personne a vérifié sa
 * boîte d'envoi : `not_sent` rouvre l'envoi, `sent` consigne (déclaratif) que le
 * message y est. L'écran relit ensuite l'état au serveur — il ne le devine pas.
 */
export function useResolveSendAttempt(contactId: string) {
  const qc = useQueryClient()
  return useMutation<unknown, Error, SendResolution['outcome']>({
    mutationKey: ['contacts', 'send-resolution', contactId],
    mutationFn: outcome => contactsApi.resolveSendAttempt(contactId, outcome),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: contactKeys.sendability(contactId) })
      qc.invalidateQueries({ queryKey: contactKeys.detail(contactId) })
    },
    onError: () => toast.error(i18n.t('contacts:email.error.unknown')),
  })
}
