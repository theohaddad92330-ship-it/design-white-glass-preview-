import { useQuery } from '@tanstack/react-query'
import { needQualificationApi, needQualificationKeys } from '../api'

/**
 * #2323.32/.34/.35/.36 / #2323.38-.45 — la question prioritaire par axe, et
 * les contradictions détectées.
 *
 * ⚠️ Une LECTURE, même patron que `useNeedVerdict` : la décision (quelle
 * question poser, quelle contradiction nommer) vit au contrat, ce hook ne
 * fait que relire ce que le serveur a déjà calculé.
 */
export function useNeedQualification(needId: string) {
  const query = useQuery({
    queryKey: needQualificationKeys.get(needId),
    queryFn: () => needQualificationApi.get(needId),
    enabled: needId.length > 0,
    staleTime: 60_000,
  })
  return {
    questions: query.data?.questions ?? [],
    contradictions: query.data?.contradictions ?? [],
    notEvaluable: query.data?.notEvaluable ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
