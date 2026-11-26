import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { RagDocumentScope } from '@bellum/contracts'
import { ragApi } from '@/features/rag/api'

/**
 * #1954.22 puis #2779 — changer la portée d'un document DÉJÀ attaché, vers
 * N'IMPORTE LAQUELLE des cinq portées du contrat (pas seulement
 * `workspace`/`conversation`). Même gabarit que `useDeleteRagDocument` (même
 * invalidation : « Connaissances » doit refléter un document qui vient d'y
 * ENTRER (portée élargie à `workspace`/`knowledge_base`) ou d'en SORTIR
 * (portée resserrée à `conversation`/`personal`/`account`).
 */
export function useUpdateRagDocumentScope() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string; scope: RagDocumentScope; conversationId?: string; accountId?: string }>(
    {
      mutationKey: ['rag', 'update-scope'],
      mutationFn: ({ id, scope, conversationId, accountId }) =>
        ragApi.updateScope(id, scope, { conversationId, accountId }),
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: ['rag-documents'] })
      },
    },
  )
}
