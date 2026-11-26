import { useQuery } from '@tanstack/react-query'
import { needHistoryApi, needHistoryKeys } from '../api'

/** L'Historique d'un besoin — ce qui a été DÉCIDÉ dessus, le plus récent
 *  d'abord. Lecture seule, voir le docblock de `ProjectsController.needHistory`
 *  (API) pour pourquoi ce n'est pas `GET /decision-gates/need/:id`. */
export function useNeedHistory(needId: string) {
  const query = useQuery({
    queryKey: needHistoryKeys.list(needId),
    queryFn: () => needHistoryApi.list(needId),
    enabled: needId.length > 0,
  })
  return {
    crossings: query.data?.crossings ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
