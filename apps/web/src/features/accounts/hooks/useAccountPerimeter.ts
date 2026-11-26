import { effectiveScopeSelection, type AnalysisScopeSelection } from '@bellum/contracts'
import { useMemo } from 'react'
import { useAccountRuns } from './useAccountRuns'

/**
 * #4044 — le périmètre géographique DÉCLARÉ d'un compte = le cadrage de sa dernière analyse (même clé React Query
 * que « Historique des analyses »). Aucune analyse ⇒ aucun périmètre, rien d'écarté. Lu par la sélection des
 * contacts à proposer sur une ligne (`proposeContactsForSignal`).
 */
export function useAccountPerimeter(accountId: string): AnalysisScopeSelection | undefined {
  const runs = useAccountRuns(accountId)
  const latestRun = runs.data?.[0]
  return useMemo(
    () =>
      latestRun
        ? effectiveScopeSelection(
            latestRun.scope_mode,
            (latestRun.scope_selection ?? undefined) as AnalysisScopeSelection | undefined,
          )
        : undefined,
    [latestRun],
  )
}
