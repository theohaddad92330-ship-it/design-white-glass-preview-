import { useQuery } from '@tanstack/react-query'
import { memoryApi, memoryKeys, type PinnedFact } from '@/features/memory/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * The pinned facts the copilot remembers. When `accountId` is given, the server
 * returns the workspace-global facts AND that account's facts. Only runs for an
 * authenticated user; lightly cached (facts change rarely within a session).
 */
export function usePinnedFacts(accountId?: string | null, conversationId?: string | null) {
  const { user } = useSession()
  return useQuery<PinnedFact[], Error>({
    // #1918.5 — le FIL fait partie de la clé : deux fils n'ont pas la même
    // mémoire, et une clé commune servirait celle du fil précédent.
    queryKey: memoryKeys.facts(accountId, conversationId),
    queryFn: () => memoryApi.listFacts(accountId, conversationId),
    enabled: !!user,
    staleTime: 30_000,
  })
}
