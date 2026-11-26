import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { CreateMessageLibraryEntry, MessageLibraryEntry } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { messageLibraryApi } from '@/features/message-library/api'

/** #4158.50 — « Ajouter un exemple » : succès et échec se disent, jamais en silence. */
export function useCreateMessageLibraryEntry() {
  const qc = useQueryClient()
  return useMutation<MessageLibraryEntry, Error, CreateMessageLibraryEntry>({
    mutationKey: ['message-library', 'create'],
    mutationFn: body => messageLibraryApi.create(body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['message-library'] })
      toast.success(i18n.t('knowledge:messageLibrary.add.success'))
    },
    onError: () => {
      toast.error(i18n.t('knowledge:messageLibrary.add.error'))
    },
  })
}
