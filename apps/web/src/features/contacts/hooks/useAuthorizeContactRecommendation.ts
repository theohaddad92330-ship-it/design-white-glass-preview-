import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { Contact, ContactRecommendationAuthorizableReason } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { contactKeys, contactsApi } from '@/features/contacts/api'

/**
 * #2160.60 — poser ou retirer « Autoriser la recommandation », sur la fiche.
 * Réversible (contrairement à `useConfirmContactIdentity`) : deux mutations
 * symétriques, comme `useContactStop`/`useRecordContactStop` n'en offrent
 * qu'une seule ici pour l'autre sens. Rien n'est patché optimistiquement : la
 * fiche relit le fait posé par le serveur.
 */
export function useAuthorizeContactRecommendation(contactId: string) {
  const qc = useQueryClient()

  return useMutation<Contact, Error, ContactRecommendationAuthorizableReason>({
    mutationKey: ['contacts', 'recommendation-authorization', 'authorize', contactId],
    mutationFn: reason => contactsApi.authorizeRecommendation(contactId, reason),
    onSuccess: () => {
      // `contactKeys.all` (préfixe `['contacts']`) reclasse aussi le chemin
      // recommandé (`contactKeys.ranking`, sous le même préfixe) : la correction
      // change l'éligibilité de ce contact au classement du compte entier.
      void qc.invalidateQueries({ queryKey: contactKeys.all })
      void qc.invalidateQueries({ queryKey: contactKeys.detail(contactId) })
      toast.success(i18n.t('contacts:recommendationAuthorization.authorizeDone'))
    },
    onError: () => toast.error(i18n.t('contacts:recommendationAuthorization.authorizeError')),
  })
}

export function useRevokeContactRecommendationAuthorization(contactId: string) {
  const qc = useQueryClient()

  return useMutation<Contact, Error, void>({
    mutationKey: ['contacts', 'recommendation-authorization', 'revoke', contactId],
    mutationFn: () => contactsApi.revokeRecommendationAuthorization(contactId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: contactKeys.all })
      void qc.invalidateQueries({ queryKey: contactKeys.detail(contactId) })
      toast.success(i18n.t('contacts:recommendationAuthorization.revokeDone'))
    },
    onError: () => toast.error(i18n.t('contacts:recommendationAuthorization.revokeError')),
  })
}
