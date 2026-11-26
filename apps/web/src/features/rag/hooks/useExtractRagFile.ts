import type { ChatImageObjects, ChatImageRegion } from '@bellum/contracts'
import { useMutation } from '@tanstack/react-query'
import { ragApi, type ExtractInput } from '@/features/rag/api'

/**
 * #2148.16 — LA PIÈCE JOINTE DE CONVERSATION (cas a) : extrait le texte d'un
 * fichier sans l'ingérer. Contrairement à `useIngestRagDocument`, aucune
 * invalidation de `['rag-documents']` — rien n'a changé dans la base de
 * connaissance, il n'y a rien à relire.
 */
export function useExtractRagFile() {
  return useMutation<
    {
      text: string
      partial: boolean
      imageObjectId?: string
      regions?: ChatImageRegion[]
      objects?: ChatImageObjects
    },
    Error,
    ExtractInput
  >({
    mutationKey: ['rag', 'extract'],
    mutationFn: input => ragApi.extract(input),
  })
}
