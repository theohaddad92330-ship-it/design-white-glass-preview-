import type { PipeByOwner, PipeInspection, PipeWaterfall } from '@bellum/contracts'
import { useQueries, useQuery } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/** Les lectures de `/pilotage/pipe` — pures, scopées au workspace actif côté serveur. */
const pipeApi = {
  inspection(): Promise<PipeInspection> {
    return apiFetch<PipeInspection>({ path: '/pilotage/pipe/inspection' })
  },
  waterfall(period?: { from: string; to: string }): Promise<PipeWaterfall> {
    const query = period ? `?from=${period.from}&to=${period.to}` : ''
    return apiFetch<PipeWaterfall>({ path: `/pilotage/pipe/waterfall${query}` })
  },
  byOwner(): Promise<PipeByOwner> {
    return apiFetch<PipeByOwner>({ path: '/pilotage/pipe/by-owner' })
  },
}

/**
 * Les clés de cache sous `['pilotage', 'pipe']` : c'est ce préfixe que les
 * écritures (`useUpdateForecastCategory`, `useUpdateCloseDate`) invalident —
 * les totaux et les signaux dépendent de ce qu'on vient de déclarer.
 */
const pipeKeys = {
  inspection: () => ['pilotage', 'pipe', 'inspection'] as const,
  waterfall: () => ['pilotage', 'pipe', 'waterfall'] as const,
  waterfallOf: (from: string, to: string) => ['pilotage', 'pipe', 'waterfall', from, to] as const,
  byOwner: () => ['pilotage', 'pipe', 'by-owner'] as const,
}

export function usePipeInspection() {
  return useQuery({ queryKey: pipeKeys.inspection(), queryFn: () => pipeApi.inspection() })
}

export function usePipeWaterfall() {
  return useQuery({ queryKey: pipeKeys.waterfall(), queryFn: () => pipeApi.waterfall() })
}

/**
 * Théo D pilotage.N1 — la clôture du waterfall pour chaque fenêtre mensuelle : un point de la courbe
 * « Évolution du pipe ». Une fenêtre qui échoue reste `null` (jamais 0 €), les autres se lisent.
 */
export function usePipeMonthlyClosings(windows: ReadonlyArray<{ month: string; from: string; to: string }>) {
  const results = useQueries({
    queries: windows.map(window => ({
      queryKey: pipeKeys.waterfallOf(window.from, window.to),
      queryFn: () => pipeApi.waterfall({ from: window.from, to: window.to }),
    })),
  })
  return {
    isLoading: results.some(result => result.isLoading),
    points: windows.map((window, index) => ({
      month: window.month,
      closingCents: results[index]?.data ? results[index].data.closingCents : null,
    })),
  }
}

export function usePipeByOwner() {
  return useQuery({ queryKey: pipeKeys.byOwner(), queryFn: () => pipeApi.byOwner() })
}
