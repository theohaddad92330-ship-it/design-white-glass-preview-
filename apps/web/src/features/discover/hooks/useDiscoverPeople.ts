import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import type { ContactListResponse } from '@bellum/contracts'
import { discoverApi } from '@/features/discover/api/discover-api'
import type { DiscoverPeopleSearchCriteria } from '@/features/discover/lib/discover-contact-rows'

/* ------------------------------------------------------------------ */
/*  #2165.7 — la liste de PERSONNES de Découvrir.                       */
/*                                                                     */
/*  Elle ne part que lorsque le type « Contacts » est choisi : c'est un */
/*  autre moteur que le registre et le signal, et tirer les trois à     */
/*  chaque recherche ferait payer une requête à personne.               */
/* ------------------------------------------------------------------ */

/** Borne dure — l'ancienne borne du registre : une liste de PERSONNES se
 *  balaye, elle ne se pagine pas. (Les COMPTES ont un « Voir plus » sans palier
 *  depuis #4016 L7 — `DISCOVER_MAX_LIMIT` est passé à 200 ; pas les personnes.) */
const DISCOVER_PEOPLE_LIMIT = 50

export function useDiscoverPeople(options: {
  enabled: boolean
  q: string
  /** #4634 — les critères du volet qui CHERCHENT (`peopleSearchCriteria`). Absents = la requête d'avant, même clé. */
  criteria?: DiscoverPeopleSearchCriteria
}): UseQueryResult<ContactListResponse> {
  const q = options.q.trim()
  const criteria = options.criteria ?? {}
  const hasCriteria = Object.keys(criteria).length > 0
  return useQuery<ContactListResponse>({
    queryKey: hasCriteria ? ['discover', 'people', q, criteria] : ['discover', 'people', q],
    enabled: options.enabled,
    // Les contacts d'un espace bougent à la journée, pas à la seconde.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: false,
    queryFn: ({ signal }) => discoverApi.people({ q: q || undefined, limit: DISCOVER_PEOPLE_LIMIT, criteria }, signal),
  })
}
