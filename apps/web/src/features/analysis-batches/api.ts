import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  AnalysisBatch,
  AnalysisBatchInput,
  AnalysisBatchPreview,
  AnalysisBatchSource,
  LauraContextMode,
} from '@bellum/contracts'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2293 — le lot d'analyses multi-comptes (`/analysis-batches`).
 *
 * La préview est une MUTATION (un POST) mais n'écrit ni ne débite rien : elle
 * n'est jamais relancée seule, seulement au geste « Prévisualiser ».
 */
const ANALYSIS_BATCHES_KEY = ['analysis-batches'] as const

export type BatchBody = {
  source: AnalysisBatchSource
  items: AnalysisBatchInput[]
  /** #2922 — le mode choisi sur la chip `analysis_batch`. Absent : défaut de l'espace. */
  context_mode?: LauraContextMode
}

/** Tant qu'un sous-job est en file ou en cours, l'écran relit le lot. */
const REFRESH_WHILE_RUNNING_MS = 15_000

export function useAnalysisBatches() {
  const { user } = useSession()
  return useQuery<AnalysisBatch[]>({
    queryKey: [...ANALYSIS_BATCHES_KEY, user?.id],
    queryFn: () => apiFetch<AnalysisBatch[]>({ path: '/analysis-batches' }),
    enabled: !!user,
    staleTime: 30_000,
    // #4671.2 — « 1 en cours » retombe sans recharger : la liste se relit tant qu'un lot tourne (comme le détail).
    refetchInterval: query =>
      query.state.data?.some(batch => batch.status === 'running') ? REFRESH_WHILE_RUNNING_MS : false,
  })
}

export function useAnalysisBatch(batchId: string) {
  const { user } = useSession()
  return useQuery<AnalysisBatch>({
    queryKey: [...ANALYSIS_BATCHES_KEY, user?.id, batchId],
    queryFn: () => apiFetch<AnalysisBatch>({ path: `/analysis-batches/${batchId}` }),
    enabled: !!user && batchId.length > 0,
    refetchInterval: query => (query.state.data?.status === 'running' ? REFRESH_WHILE_RUNNING_MS : false),
  })
}

export function useAnalysisBatchMutations() {
  const queryClient = useQueryClient()
  const onSuccess = () => queryClient.invalidateQueries({ queryKey: ANALYSIS_BATCHES_KEY })
  return {
    /** Invalide la liste des lots — appelé par l'écran qui CRÉE le lot (GA-86 : il y monte sa préview de coût). */
    invalidate: onSuccess,
    preview: useMutation({
      mutationFn: (body: BatchBody) =>
        apiFetch<AnalysisBatchPreview, BatchBody>({ path: '/analysis-batches/preview', method: 'POST', body }),
    }),
    cancel: useMutation({
      mutationFn: (batchId: string) =>
        apiFetch<AnalysisBatch>({ path: `/analysis-batches/${batchId}/cancel`, method: 'POST' }),
      onSuccess,
    }),
    retry: useMutation({
      mutationFn: (batchId: string) =>
        apiFetch<AnalysisBatch>({ path: `/analysis-batches/${batchId}/retry`, method: 'POST' }),
      onSuccess,
    }),
    confirm: useMutation({
      mutationFn: ({ batchId, itemId, siren }: { batchId: string; itemId: string; siren: string }) =>
        apiFetch<AnalysisBatch, { siren: string }>({
          path: `/analysis-batches/${batchId}/items/${itemId}/confirm`,
          method: 'POST',
          body: { siren },
        }),
      onSuccess,
    }),
    /** #2283.32 — l'AUTRE issue d'une ambiguïté (`to_confirm` ou `needs_resolution`) : exclure ce sous-job du lot. */
    exclude: useMutation({
      mutationFn: ({ batchId, itemId }: { batchId: string; itemId: string }) =>
        apiFetch<AnalysisBatch>({ path: `/analysis-batches/${batchId}/items/${itemId}/exclude`, method: 'POST' }),
      onSuccess,
    }),
  }
}
