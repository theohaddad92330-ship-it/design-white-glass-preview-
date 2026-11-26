import { OPEN_PIPELINE_STAGES, type MonthObjective } from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useTeamOpenActions } from '@/features/manager/hooks/useTeamOpenActions'
import { summarizeCollections } from '@/features/missions/collections'
import { useInvoiceReadiness } from '@/features/missions/api'
import { useSession } from '@/lib/hooks/use-session'
import { pilotageApi } from '../../api'
import { financeBilling } from '../../finance/finance-billing'
import { usePipeInspection } from '../../pipe/api'
import { useStaffingOverview } from '../../staffing/api'

/** Une somme de montants en centimes dont certains sont inconnus : `null` seulement si AUCUN ne se lit. */
function sumKnown(cents: ReadonlyArray<number | null>): number | null {
  const known = cents.filter((value): value is number => value !== null && Number.isFinite(value))
  return known.length === 0 ? null : known.reduce((sum, value) => sum + value, 0)
}

/**
 * LES CHIFFRES DU COCKPIT — UNE lecture pour les tuiles, le cap, la carte
 * d'encaissement, les étapes et l'export de la synthèse (GA-26 : une dérivation à
 * un seul endroit, jamais un second décompte). Chaque valeur est `null` quand elle
 * n'a pas pu être lue : « non mesuré » n'est jamais « 0 » (GA-18 / GA-19).
 *
 * Aucune probabilité, aucun pondéré : le pipe est la somme des montants saisis.
 */
export function useCockpitFigures() {
  const { user } = useSession()
  const month = useMemo(() => new Date().toISOString().slice(0, 7), [])
  const objectiveQuery = useQuery({
    queryKey: ['pilotage', 'month-objective', user?.id],
    queryFn: pilotageApi.monthObjective,
    enabled: !!user,
    staleTime: 30_000,
  })
  const inspection = usePipeInspection()
  const staffing = useStaffingOverview()
  const actions = useTeamOpenActions()
  const readiness = useInvoiceReadiness(month)

  const objective: MonthObjective | null = objectiveQuery.data ?? null

  const stages = useMemo(() => {
    const rows = inspection.data?.rows ?? []
    return OPEN_PIPELINE_STAGES.map(stage => ({ stage, count: rows.filter(row => row.stage === stage).length })).filter(
      entry => entry.count > 0,
    )
  }, [inspection.data])

  const cash = useMemo(() => {
    const items = readiness.data?.items
    if (!items || items.length === 0) return null
    const summary = summarizeCollections(items, new Date())
    const billing = financeBilling(items)
    const toFollowCents = sumKnown([
      summary.pending.amountCents,
      summary.overdue.amountCents,
      summary.disputed.amountCents,
    ])
    const toEuros = (cents: number | null) => (cents === null ? null : cents / 100)
    return {
      collected: toEuros(summary.paid.amountCents),
      toFollow: toEuros(toFollowCents),
      drafts: toEuros(billing.prepared.amountCents),
      draftCount: billing.prepared.count,
    }
  }, [readiness.data])

  return {
    month,
    objective,
    objectiveLoading: objectiveQuery.isLoading,
    objectiveFailed: objectiveQuery.isError,
    pipeOpen: objective?.openPipe ?? null,
    won: objective?.realised ?? null,
    bench: staffing.data?.bench?.consultants?.length ?? null,
    actions,
    stages,
    stagesLoaded: inspection.isSuccess,
    cash,
    cashLoading: readiness.isLoading,
  }
}

export type CockpitFigures = ReturnType<typeof useCockpitFigures>
