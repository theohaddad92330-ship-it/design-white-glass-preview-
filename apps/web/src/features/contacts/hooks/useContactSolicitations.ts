import { useQuery } from '@tanstack/react-query'
import type { ContactSolicitationsResponse } from '@bellum/contracts'
import { contactKeys, contactsApi } from '@/features/contacts/api'

/**
 * #3263.28 (épopée #3282) — RISQUE DE COLLISION sur l'écran Comité d'achat :
 * deux actions commerciales non coordonnées sur le MÊME contact. RÉUTILISE
 * `contactsApi.solicitations` (#2386.6/#2128.17 — déjà groupé, un aller-retour
 * jamais un par contact), jamais un second mécanisme de détection.
 */
export function useContactSolicitations(contactIds: readonly string[]) {
  return useQuery<ContactSolicitationsResponse>({
    queryKey: contactKeys.solicitations(contactIds),
    queryFn: () => contactsApi.solicitations(contactIds),
    enabled: contactIds.length > 0,
  })
}
