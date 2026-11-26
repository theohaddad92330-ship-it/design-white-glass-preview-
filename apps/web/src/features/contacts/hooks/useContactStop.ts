import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ContactStop, ContactStopReason } from '@bellum/contracts'
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * « Cette personne a-t-elle demandé qu'on cesse ? »
 *
 * Le refus vit dans `contact_stops` (espace + contact) : le client ne peut pas
 * le déduire de la fiche, exactement comme le désabonnement d'adresse. Sans cet
 * appel, l'écran affiche un contact « joignable » que le serveur refusera.
 */
export function useContactStop(id: string) {
  const { user } = useSession()
  return useQuery<ContactStop | null>({
    queryKey: contactKeys.stop(id),
    queryFn: () => contactsApi.getStop(id),
    enabled: !!user && id.length > 0,
    staleTime: 60_000,
  })
}

/**
 * Enregistrer le refus — et rien d'autre.
 *
 * ⚠️ Aucune levée. Il n'existe volontairement pas de route pour retirer un
 * refus (décision D351) : ce geste appartient à la personne, pas à nous. Un
 * hook `useLiftContactStop` n'aurait donc rien à appeler, et l'écrire
 * inviterait quelqu'un à ouvrir la route pour le servir.
 *
 * Rien n'est patché optimistiquement : poser l'arrêt inscrit AUSSI l'adresse à
 * la liste de suppression et annule les séquences en cours — des conséquences
 * qui se lisent au rechargement, et qu'un état local inventé masquerait.
 */
export function useRecordContactStop(contactId: string) {
  const { t } = useTranslation('contacts')
  const queryClient = useQueryClient()

  return useMutation<ContactStop, Error, { reason: ContactStopReason; note?: string }>({
    mutationFn: body => contactsApi.recordStop(contactId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: contactKeys.stop(contactId) })
      void queryClient.invalidateQueries({ queryKey: contactKeys.detail(contactId) })
      void queryClient.invalidateQueries({ queryKey: contactKeys.sendability(contactId) })
      void queryClient.invalidateQueries({ queryKey: contactKeys.all })
      toast.success(t('stop.done'), { description: t('stop.doneDescription') })
    },
    onError: () => toast.error(t('stop.failed')),
  })
}
