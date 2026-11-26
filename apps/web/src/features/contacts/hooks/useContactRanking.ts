import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ContactRankingQuery, ContactRankingResponse } from '@bellum/contracts'
import { contactKeys, contactsApi } from '@/features/contacts/api'

/**
 * #2120.30-38 — le chemin recommandé d'un compte, classé côté API sur neuf axes
 * nommés. Changer le périmètre, le sujet ou l'offre refait la requête ; l'ordre
 * précédent reste affiché le temps qu'elle revienne (jamais une liste vide qui
 * clignote entre deux choix).
 */
export function useContactRanking(accountId: string, query: ContactRankingQuery) {
  return useQuery<ContactRankingResponse>({
    queryKey: contactKeys.ranking(accountId, query),
    queryFn: () => contactsApi.rankByAccount(accountId, query),
    placeholderData: keepPreviousData,
    enabled: Boolean(accountId),
  })
}
