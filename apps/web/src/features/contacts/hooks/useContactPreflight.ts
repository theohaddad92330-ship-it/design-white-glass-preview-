import { useQuery } from '@tanstack/react-query'
import type { ContactPreflight } from '@bellum/contracts'
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { useSession } from '@/lib/hooks/use-session'

/** #3219 (#190.2 côté contact) — le contrôle avant action d'une personne, lu par identité d'objet. */
export function useContactPreflight(id: string) {
  const { user } = useSession()
  return useQuery<ContactPreflight>({
    queryKey: contactKeys.preflight(id),
    queryFn: () => contactsApi.getPreflight(id),
    enabled: !!user && id.length > 0,
  })
}
