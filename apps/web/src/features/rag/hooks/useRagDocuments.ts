import { useQuery } from '@tanstack/react-query'
import { ragApi, type RagDocument } from '@/features/rag/api'
import { useSession } from '@/lib/hooks/use-session'

export function useRagDocuments(options: { enabled?: boolean } = {}) {
  const { user } = useSession()
  return useQuery<RagDocument[]>({
    queryKey: ['rag-documents', user?.id],
    queryFn: () => ragApi.list(),
    // #4424.2 — le brief d'un R1 ne lit les documents que quand il les cite.
    enabled: !!user && (options.enabled ?? true),
    staleTime: 30_000,
  })
}
