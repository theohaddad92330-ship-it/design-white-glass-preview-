import type { ProbableQuarter } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/** #4016 L1 — le CA probable du trimestre, calibré côté serveur à la lecture. */
export function useProbableQuarter() {
  return useQuery({
    queryKey: ['projects', 'probable-quarter'] as const,
    queryFn: () => apiFetch<ProbableQuarter>({ path: '/projects/probable-quarter' }),
  })
}
