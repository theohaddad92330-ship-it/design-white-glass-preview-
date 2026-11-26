import { useQuery } from '@tanstack/react-query'
import { ragApi } from '@/features/rag/api'

/**
 * #2876 (#2433.4) — RÉOUVRIR l'image d'un message DÉJÀ ENVOYÉ : un clic
 * demande l'URL signée (cinq minutes). `enabled` reste faux tant que l'aperçu
 * n'est pas ouvert — inutile de récupérer l'URL de CHAQUE image jointe tant
 * que personne ne l'a demandé. Même patron que `useRagDocumentContent`.
 */
export function useChatImageUrl(objectId: string | null) {
  return useQuery({
    queryKey: ['rag-documents', 'image', objectId],
    queryFn: () => ragApi.getImageUrl(objectId as string),
    enabled: objectId !== null,
  })
}
