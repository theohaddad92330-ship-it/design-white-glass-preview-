import { useQuery } from '@tanstack/react-query'
import { needDocumentsApi, needDocumentsKeys } from '../api'

/** Les documents d'un besoin — devis, NDA, contrat cadre — et leur statut.
 *  Lecture seule, voir le docblock de `NeedDocumentsService` (API). */
export function useNeedDocuments(needId: string) {
  const query = useQuery({
    queryKey: needDocumentsKeys.list(needId),
    queryFn: () => needDocumentsApi.list(needId),
    enabled: needId.length > 0,
  })
  return {
    items: query.data?.items ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
