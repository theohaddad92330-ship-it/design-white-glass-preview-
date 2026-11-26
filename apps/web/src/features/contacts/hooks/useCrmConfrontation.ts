import { useQuery } from '@tanstack/react-query'
import { contactsApi } from '@/features/contacts/api'

/**
 * #2120.48 — « Confronter avec mon CRM ». Lecture pure du dernier instantané
 * déjà en base (décision Louis 18/09/2026) : `enabled` seulement à l'ouverture
 * du dialogue (`CrmConfrontationDialog`), pour ne rien lire tant que personne
 * n'a cliqué le bouton.
 */
export function useCrmConfrontation(accountId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['contacts', 'crm-confrontation', accountId],
    queryFn: () => contactsApi.crmConfrontation(accountId),
    enabled: enabled && !!accountId,
  })
}
