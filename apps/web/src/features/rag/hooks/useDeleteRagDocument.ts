import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ragApi } from '@/features/rag/api'

export function useDeleteRagDocument() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationKey: ['rag', 'delete'],
    mutationFn: (id: string) => ragApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rag-documents'] })
    },
  })
}
