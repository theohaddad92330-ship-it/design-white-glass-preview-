import { useQuery } from '@tanstack/react-query'
import type { ReplyMemoryUses } from '@bellum/contracts'
import { memoryApi, memoryKeys } from '@/features/memory/api'

/**
 * #1916.24 — la mémoire consultée pour UNE réponse.
 *
 * Appelé par `ReplyMemoryUses`, qui n'est monté qu'à l'OUVERTURE du panneau
 * « Voir la source » : un fil de quarante réponses ne déclenche aucune lecture
 * tant que personne n'ouvre un panneau. Une trace ne change qu'à l'oubli d'un
 * élément (qui invalide `memoryKeys.all`) : rouvrir le même panneau ne relit pas.
 */
export function useReplyMemoryUses(messageId: string) {
  return useQuery<ReplyMemoryUses, Error>({
    queryKey: memoryKeys.replyUses(messageId),
    queryFn: () => memoryApi.getReplyUses(messageId),
    staleTime: 60_000,
    retry: false,
  })
}
