import type { StaffingCapacity, StaffingOverview } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'

/**
 * Les trois routes `GET|PUT /pilotage/staffing/*` (L3, 14/10/2026). Le serveur
 * calcule, l'écran n'additionne rien : la capacité, l'intercontrat, les fins de
 * mission et le TACE arrivent finis, avec leur période et leur dénominateur.
 */
export const staffingKeys = {
  capacity: () => ['pilotage', 'staffing', 'capacity'] as const,
  overview: () => ['pilotage', 'staffing', 'overview'] as const,
}

export function useStaffingCapacity() {
  return useQuery({
    queryKey: staffingKeys.capacity(),
    queryFn: () => apiFetch<StaffingCapacity>({ path: '/pilotage/staffing/capacity' }),
    retry: false,
  })
}

export function useStaffingOverview() {
  return useQuery({
    queryKey: staffingKeys.overview(),
    queryFn: () => apiFetch<StaffingOverview>({ path: '/pilotage/staffing/overview' }),
    retry: false,
  })
}

/** `null` éteint l'alerte : le seul geste de retour arrière. */
export function useSetTaceThreshold() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (thresholdPercent: number | null) =>
      apiFetch<{ thresholdPercent: number | null }, { thresholdPercent: number | null }>({
        path: '/pilotage/staffing/tace-threshold',
        method: 'PUT',
        body: { thresholdPercent },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: staffingKeys.overview() }),
  })
}
