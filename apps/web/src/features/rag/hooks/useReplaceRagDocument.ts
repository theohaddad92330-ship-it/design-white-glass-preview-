import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ragApi, type IngestInput } from '@/features/rag/api'

/** #2431.5 (reste, épopée #2886) — « Remplacer / actualiser » une source déjà
 *  importée. Même forme que `useIngestRagDocument`, ciblée sur l'ANCIEN document. */
export function useReplaceRagDocument() {
  const qc = useQueryClient()
  return useMutation<{ id: string | null; partial: boolean }, Error, { id: string; input: IngestInput }>({
    mutationKey: ['rag', 'replace'],
    mutationFn: ({ id, input }) => ragApi.replace(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rag-documents'] })
    },
  })
}
