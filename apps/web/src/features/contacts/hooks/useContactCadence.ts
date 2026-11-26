import { useQuery } from '@tanstack/react-query'
import type { ContactCadence } from '@bellum/contracts'
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Moteur de cadence multi-touch (Drive #8) — le calendrier de relance d'un
 * contact + la prochaine action. Backs the cadence card on the contact detail.
 */
export function useContactCadence(id: string) {
  const { user } = useSession()
  return useQuery<ContactCadence>({
    queryKey: contactKeys.cadence(id),
    queryFn: () => contactsApi.getCadence(id),
    enabled: !!user && id.length > 0,
  })
}
