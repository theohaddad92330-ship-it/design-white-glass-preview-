import { useQuery } from '@tanstack/react-query'
import type { ContactAssociations } from '@bellum/contracts'
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { useSession } from '@/lib/hooks/use-session'

/** #3712 — les dossiers associés à une personne, lus par identité d'objet. */
export function useContactAssociations(id: string) {
  const { user } = useSession()
  return useQuery<ContactAssociations>({
    queryKey: contactKeys.associations(id),
    queryFn: () => contactsApi.getAssociations(id),
    enabled: !!user && id.length > 0,
  })
}
