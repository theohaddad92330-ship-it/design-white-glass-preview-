import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { actionOsApi, actionOsKeys } from '@/features/action-os/api'
import { useRoutines } from '@/features/routines/api'
import { useAutomationRules } from './api'
import { buildAutomationRows } from './automationRows'

/**
 * Théo C automations-liste — les lignes de « Mes automatisations », lues UNE fois et partagées : la grille de cartes
 * et le compteur du sous-onglet racontent le même nombre (une donnée vit à un seul endroit).
 */
export function useAutomationRows() {
  const rules = useAutomationRules()
  const routines = useRoutines()
  const workflows = useQuery({
    queryKey: actionOsKeys.workflows,
    queryFn: () => actionOsApi.workflows(),
    staleTime: Infinity,
  })
  const rows = useMemo(
    () =>
      buildAutomationRows({
        rules: rules.data ?? [],
        routines: routines.data ?? [],
        workflows: workflows.data?.workflows ?? [],
      }),
    [rules.data, routines.data, workflows.data],
  )
  return { rows, rules, routines, loading: rules.isLoading }
}
