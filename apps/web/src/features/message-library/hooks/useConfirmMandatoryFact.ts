import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { MessageLibraryEntry } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { messageLibraryApi } from '@/features/message-library/api'

/** #3439.1 — « ce fait est vrai » : un geste humain, fait par fait. */
export function useConfirmMandatoryFact() {
  const qc = useQueryClient()
  return useMutation<MessageLibraryEntry, Error, { id: string; fact: string }>({
    mutationKey: ['message-library', 'confirm-fact'],
    mutationFn: ({ id, fact }) => messageLibraryApi.confirmFact(id, fact),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['message-library'] })
    },
    onError: err => {
      toast.error(err instanceof Error ? err.message : i18n.t('knowledge:messageLibrary.facts.error'))
    },
  })
}
