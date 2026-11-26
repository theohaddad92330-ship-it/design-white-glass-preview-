import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { i18n } from '@/i18n'
import { memoryApi, memoryKeys } from '@/features/memory/api'

/** Remove a pinned fact from the copilot's memory. Refreshes all facts queries. */
export function useUnpinFact() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationKey: ['memory', 'unpin'],
    mutationFn: id => memoryApi.unpinFact(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: memoryKeys.all })
    },
    onError: err => toast.error(i18n.t('knowledge:memory.toast.unpinFailed'), { description: err.message }),
  })
}
