import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { MessageLibraryEntry } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { messageLibraryApi } from '@/features/message-library/api'

/** #3437 / #3438 — « ce chiffre est vrai » : un geste humain, affirmation par affirmation. */
export function useConfirmMessageClaim() {
  const qc = useQueryClient()
  return useMutation<MessageLibraryEntry, Error, { id: string; claimIndex: number }>({
    mutationKey: ['message-library', 'confirm-claim'],
    mutationFn: ({ id, claimIndex }) => messageLibraryApi.confirmClaim(id, claimIndex),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['message-library'] })
    },
    onError: err => {
      toast.error(err instanceof Error ? err.message : i18n.t('knowledge:messageLibrary.claims.error'))
    },
  })
}
