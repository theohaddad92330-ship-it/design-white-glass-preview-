import { useMutation } from '@tanstack/react-query'
import type { CreateMessageStyleImport, MessageStyleImportResult } from '@bellum/contracts'
import { messageStyleApi } from '@/features/message-style/api'

/** #2369.2/.3/.4/.5 — importer un message, recevoir l'analyse préalable. */
export function useMessageStyleImport() {
  return useMutation<MessageStyleImportResult, Error, CreateMessageStyleImport>({
    mutationFn: input => messageStyleApi.importMessage(input),
  })
}
