import { useQuery } from '@tanstack/react-query'
import type { Contact } from '@bellum/contracts'
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { useSession } from '@/lib/hooks/use-session'

/** Single contact by id — backs the contact detail page. */
export function useContact(id: string) {
  const { user } = useSession()
  return useQuery<Contact>({
    queryKey: contactKeys.detail(id),
    queryFn: () => contactsApi.getOne(id),
    enabled: !!user && id.length > 0,
  })
}
