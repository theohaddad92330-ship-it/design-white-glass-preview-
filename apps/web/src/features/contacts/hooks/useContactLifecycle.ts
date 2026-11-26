import { useQuery } from '@tanstack/react-query'
import type { ContactLifecycleHistory } from '@bellum/contracts'
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Contact lifecycle journal (P0 « états + providers ») — the persisted state +
 * the dated, sourced history of each passage (détecté le … / vérifié le … /
 * enrichi le …). Backs the lifecycle timeline on the contact detail.
 */
export function useContactLifecycle(id: string) {
  const { user } = useSession()
  return useQuery<ContactLifecycleHistory>({
    queryKey: contactKeys.lifecycle(id),
    queryFn: () => contactsApi.getLifecycle(id),
    enabled: !!user && id.length > 0,
  })
}
