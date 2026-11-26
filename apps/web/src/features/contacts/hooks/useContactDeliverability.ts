import { useQuery } from '@tanstack/react-query'
import { contactKeys, contactsApi } from '../api'

/** #2384.5 — délivrabilité (bounce/raisons), distincte du taux d'envoi. */
export function useContactDeliverability() {
  return useQuery({
    queryKey: contactKeys.deliverability,
    queryFn: contactsApi.getDeliverability,
    staleTime: 60_000,
  })
}
