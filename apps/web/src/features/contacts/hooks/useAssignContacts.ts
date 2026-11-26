import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { ContactAssignmentResult } from '@bellum/contracts'
import { contactKeys, contactsApi } from '@/features/contacts/api'

type AssignContactsVariables = {
  contactIds: string[]
  /** `null` retire l'attribution de la sélection. */
  assignedTo: string | null
  /** Nom affiché du destinataire — sert UNIQUEMENT au libellé du toast. */
  assigneeName?: string
}

/**
 * Attribue une SÉLECTION de contacts à un membre de l'espace (ou la libère).
 *
 * Le toast rend compte de ce que le SERVEUR a écrit, pas de ce qu'on lui a
 * demandé : un commercial qui coche dix lignes dont deux sont portées par un
 * collègue en attribue huit, et il l'apprend. Aucun compteur n'est estimé côté
 * client, et rien n'est patché optimistiquement — le serveur peut légitimement
 * refuser une ligne, et un compteur faux vaut moins qu'un aller-retour.
 */
export function useAssignContacts() {
  const { t } = useTranslation('contacts')
  const queryClient = useQueryClient()

  return useMutation<ContactAssignmentResult, Error, AssignContactsVariables>({
    mutationFn: ({ contactIds, assignedTo }) => contactsApi.assignBulk(contactIds, assignedTo),
    onSuccess: (result, variables) => {
      void queryClient.invalidateQueries({ queryKey: contactKeys.all })
      for (const id of result.assigned) {
        void queryClient.invalidateQueries({ queryKey: contactKeys.detail(id) })
      }

      const skipped = result.skipped.length
      const description = skipped > 0 ? t('selection.assign.skipped', { count: skipped }) : undefined

      if (result.assigned.length === 0) {
        toast.error(t('selection.assign.nothingChanged'), description ? { description } : undefined)
        return
      }

      const message =
        result.assigned_to === null
          ? t('selection.assign.released', { count: result.assigned.length })
          : t('selection.assign.assigned', {
              count: result.assigned.length,
              name: variables.assigneeName ?? t('selection.assign.memberFallback'),
            })
      toast.success(message, description ? { description } : undefined)
    },
    onError: (error: Error) => {
      const status = typeof error.cause === 'number' ? error.cause : null
      if (status === 403) {
        toast.error(t('selection.assign.forbidden'))
        return
      }
      // La phrase du serveur (ex. « ce membre n'appartient pas à l'espace de
      // travail ») est la seule raison exploitable — l'avaler derrière un
      // « a échoué » générique la remplacerait par une fiction plus vague.
      toast.error(t('selection.assign.failed'), error.message ? { description: error.message } : undefined)
    },
  })
}
