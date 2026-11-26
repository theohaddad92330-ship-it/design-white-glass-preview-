import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  analysisHistoryResponseSchema,
  type AnalysisHistoryResponse,
  type AnalysisHistoryScope,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

const ANALYSIS_HISTORY_KEY = ['analysis-history'] as const

/**
 * Théo B r2-mes-analyses — l'historique des analyses lancées dans l'espace. Parsé à la frontière : un corps hors
 * contrat devient un échec de requête nommé, pas un écran vide.
 */
export function useAnalysisHistory(scope: AnalysisHistoryScope) {
  const { user } = useSession()
  return useQuery<AnalysisHistoryResponse>({
    queryKey: [...ANALYSIS_HISTORY_KEY, user?.id, scope],
    queryFn: async () =>
      analysisHistoryResponseSchema.parse(await apiFetch<unknown>({ path: `/analysis/history?scope=${scope}` })),
    enabled: !!user,
    staleTime: 30_000,
  })
}

/** « Retirer cet élément de l'historique » : masque MA ligne, le dossier du compte reste intact. */
export function useHideAnalysisRun() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) =>
      apiFetch<{ id: string }>({ path: `/analysis/history/${runId}/hide`, method: 'POST' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ANALYSIS_HISTORY_KEY }),
  })
}
