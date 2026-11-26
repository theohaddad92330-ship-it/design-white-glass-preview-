import { useQuery } from '@tanstack/react-query'
import type { AnswerMetaMap } from '@bellum/contracts'
import { esnProfileApi, esnProfileKeys } from '@/features/profile/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2006.22 — le statut PAR CLÉ (confirmé / proposé / corrigé / inconnu) d'une
 * réponse du profil, séparé de `useEsnProfile` : c'est le seul écran de
 * réponses (Réglages › Profil) qui en a besoin, `EsnAnswers` reste consommé
 * tel quel par tous ses autres lecteurs.
 */
export function useAnswerStatus() {
  const { user } = useSession()
  return useQuery<AnswerMetaMap>({
    queryKey: esnProfileKeys.answerStatus,
    queryFn: () => esnProfileApi.getAnswerStatus(),
    enabled: !!user,
    staleTime: 60_000,
  })
}
