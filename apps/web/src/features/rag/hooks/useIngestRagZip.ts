import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { RagZipIngestReport } from '@bellum/contracts'
import { ragApi, type IngestZipInput } from '@/features/rag/api'

/** #2667.1 — même forme que `useIngestRagDocument` : une archive dépliée crée
 *  plusieurs documents, la liste `/knowledge` doit donc se relire aussi. */
export function useIngestRagZip() {
  const qc = useQueryClient()
  return useMutation<RagZipIngestReport, Error, IngestZipInput>({
    mutationKey: ['rag', 'ingest-zip'],
    mutationFn: input => ragApi.ingestZip(input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rag-documents'] })
    },
  })
}
