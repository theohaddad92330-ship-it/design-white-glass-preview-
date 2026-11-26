import { useQuery } from '@tanstack/react-query'
import { ragApi } from '@/features/rag/api'

/**
 * #1954.19 — PRÉVISUALISER un document DÉJÀ attaché : un clic ouvre un aperçu
 * de son contenu. `enabled` reste faux tant que l'aperçu n'est pas ouvert —
 * inutile de récupérer le contenu de CHAQUE pièce jointe tant que personne ne
 * l'a demandé.
 */
export function useRagDocumentContent(id: string | null) {
  return useQuery({
    queryKey: ['rag-documents', id, 'content'],
    queryFn: () => ragApi.getContent(id as string),
    enabled: id !== null,
  })
}
