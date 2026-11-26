import type { PersonErasureResult } from '@bellum/contracts'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { contactKeys, contactsApi } from '@/features/contacts/api'

/**
 * #2297 — effacer une personne (RGPD art. 17, décision Louis du 19/09/2026).
 *
 * Rien n'est retiré optimistiquement : l'effacement est IRRÉVERSIBLE, et une
 * fiche qui disparaîtrait de l'écran avant que le serveur l'ait réellement
 * supprimée ferait croire à un effacement qui n'a pas eu lieu. Au succès, la
 * fiche n'existe plus : sa lecture est RETIRÉE du cache (pas seulement
 * invalidée — la relire répondrait 404), et `onErased` ramène l'écran ailleurs.
 */
export function useErasePerson() {
  const { t } = useTranslation('contacts')
  const queryClient = useQueryClient()

  return useMutation<PersonErasureResult, Error, { id: string; onErased?: () => void }>({
    mutationFn: ({ id }) => contactsApi.erase(id),
    onSuccess: (_result, { id, onErased }) => {
      queryClient.removeQueries({ queryKey: contactKeys.detail(id) })
      void queryClient.invalidateQueries({ queryKey: contactKeys.all })
      toast.success(t('erasure.done'), { description: t('erasure.doneDescription') })
      onErased?.()
    },
    onError: () => toast.error(t('erasure.failed')),
  })
}
