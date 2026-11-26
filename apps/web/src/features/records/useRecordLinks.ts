import { useQuery } from '@tanstack/react-query'
import type { RecordLinksResponse, RecordPanelKind } from '@bellum/contracts'
import { apiFetch } from '@/lib/api'

const recordLinksKey = (kind: RecordPanelKind, id: string) => ['record-links', kind, id] as const

/**
 * #4194 (lot L3) — les trois zones du panneau latéral unique : propriétés,
 * historique, objets liés. Lecture seule ; un clic sur un objet lié change la
 * clé, donc la requête, sans toucher à l'adresse (panneau sans URL).
 */
export function useRecordLinks(kind: RecordPanelKind, id: string) {
  return useQuery({
    queryKey: recordLinksKey(kind, id),
    queryFn: () => apiFetch<RecordLinksResponse>({ path: `/record-links/${kind}/${id}` }),
    staleTime: 30_000,
  })
}
