import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { WritableImportObject } from '@bellum/contracts'
import { ragApi, type IngestInput } from '@/features/rag/api'

export function useIngestRagDocument() {
  const qc = useQueryClient()
  return useMutation<
    {
      id: string | null
      partial: boolean
      suggestedObject: WritableImportObject | null
      pendingImportSessionId: string | null
    },
    Error,
    IngestInput
  >({
    mutationKey: ['rag', 'ingest'],
    mutationFn: input => ragApi.ingest(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rag-documents'] })
    },
  })
}
