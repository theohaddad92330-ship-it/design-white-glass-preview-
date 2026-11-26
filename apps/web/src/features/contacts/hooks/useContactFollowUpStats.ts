import { useQuery } from '@tanstack/react-query'
import { contactKeys, contactsApi } from '../api'

/**
 * #2842 (reste, 26/09) — `contactFollowUps` de l'audit commercial
 * (`useCommercialAudit.ts`). Non lu (chargement, erreur) ⇒ `data` reste
 * `undefined`, jamais un compte deviné (même discipline que
 * `useContactDeliverability`).
 */
export function useContactFollowUpStats() {
  return useQuery({
    queryKey: contactKeys.followUpStats,
    queryFn: contactsApi.getFollowUpStats,
    staleTime: 60_000,
  })
}
