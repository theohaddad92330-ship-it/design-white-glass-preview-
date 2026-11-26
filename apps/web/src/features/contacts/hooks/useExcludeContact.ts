import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { contactKeys, contactsApi } from '@/features/contacts/api'

/**
 * Écarter un contact, avec son motif (PDF 2, items 82-83).
 *
 * Le toast dit le nombre de séquences ARRÊTÉES, et c'est le point : une relance
 * programmée qui vient d'être annulée est une conséquence que l'utilisateur n'a
 * pas demandée explicitement. La lui cacher lui ferait découvrir plus tard
 * qu'une campagne s'est arrêtée sans qu'il sache pourquoi.
 *
 * Rien n'est patché optimistiquement : le serveur refuse un motif vide, et un
 * contact qui disparaîtrait de la liste avant d'être réellement écarté
 * réapparaîtrait au rechargement.
 */
export function useExcludeContact() {
  const { t } = useTranslation('contacts')
  const queryClient = useQueryClient()

  return useMutation<{ contact_id: string; cancelled_sequences: number }, Error, { id: string; reason: string }>({
    mutationFn: ({ id, reason }) => contactsApi.exclude(id, reason),
    onSuccess: result => {
      void queryClient.invalidateQueries({ queryKey: contactKeys.all })
      void queryClient.invalidateQueries({ queryKey: contactKeys.detail(result.contact_id) })
      toast.success(
        t('exclude.done'),
        result.cancelled_sequences > 0
          ? { description: t('exclude.sequencesStopped', { count: result.cancelled_sequences }) }
          : undefined,
      )
    },
    onError: () => toast.error(t('exclude.failed')),
  })
}

/** Réintégrer un contact écarté. Le motif disparaît AVEC l'exclusion. */
export function useRestoreContact() {
  const { t } = useTranslation('contacts')
  const queryClient = useQueryClient()

  return useMutation<{ contact_id: string }, Error, string>({
    mutationFn: id => contactsApi.restore(id),
    onSuccess: result => {
      void queryClient.invalidateQueries({ queryKey: contactKeys.all })
      void queryClient.invalidateQueries({ queryKey: contactKeys.detail(result.contact_id) })
      toast.success(t('exclude.restored'))
    },
    onError: () => toast.error(t('exclude.failed')),
  })
}
