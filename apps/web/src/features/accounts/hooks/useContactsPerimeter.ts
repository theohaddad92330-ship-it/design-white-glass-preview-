import { useQuery } from '@tanstack/react-query'
import type { ContactPerimeter } from '@bellum/contracts'
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #4996 L6 — les contacts d'un compte VUS DEPUIS le périmètre du lecteur. Le serveur décide (zones du lecteur,
 * garde « entité ∈ zones OU sans entité OU entité par défaut ») ; le web ne recalcule rien. Sans zone d'entité,
 * `outside_perimeter_count` vaut `null` : aucun segment, aucun filtre, la liste d'avant.
 */
export function useContactsPerimeter(accountId: string, mode: ContactPerimeter) {
  const { user } = useSession()
  return useQuery({
    queryKey: contactKeys.perimeter(accountId, mode),
    queryFn: () => contactsApi.listByAccountPerimeter(accountId, mode),
    enabled: !!user && accountId.length > 0,
  })
}
