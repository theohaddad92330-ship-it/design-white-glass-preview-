import { useQuery } from '@tanstack/react-query'
import { needStatusHistoryApi, needStatusHistoryKeys } from '../api'

/** #2967 (lot V39) — les changements d'état journalisés d'un besoin, lus tels
 *  quels. Un échec de lecture n'est pas un journal vide : `isError` le dit. */
export function useNeedStatusHistory(needId: string) {
  const query = useQuery({
    queryKey: needStatusHistoryKeys.list(needId),
    queryFn: () => needStatusHistoryApi.list(needId),
    enabled: needId.length > 0,
  })
  return { items: query.data?.items ?? [], isError: query.isError }
}
