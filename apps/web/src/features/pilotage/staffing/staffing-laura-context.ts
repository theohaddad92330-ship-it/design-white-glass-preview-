import type { TFunction } from 'i18next'
import type { LauraContextFacet, LauraPageContext } from '@bellum/contracts'

type StaffingContextInput = {
  isLoading: boolean
  /** `null` = pas encore lu : jamais « 0 consultant ». */
  benchCount: number | null
  endingsWithin30: number | null
  thresholdPercent: number | null
  /** Le TACE réel du mois courant est-il mesuré ? `null` = pas encore lu. */
  actualMeasured: boolean | null
}

/**
 * Ce que `/pilotage/staffing` déclare à Laura : ce qui est lu, et ce qui manque —
 * un seuil non saisi et un TACE réel non mesuré sont NOMMÉS, jamais comptés comme 0.
 */
export function staffingLauraContext(t: TFunction<'pilotage'>, input: StaffingContextInput): LauraPageContext {
  const facets: LauraContextFacet[] = []
  if (input.benchCount !== null) facets.push({ label: t('staffing.laura.bench'), value: String(input.benchCount) })
  if (input.endingsWithin30 !== null) {
    facets.push({ label: t('staffing.laura.endings'), value: String(input.endingsWithin30) })
  }
  if (input.thresholdPercent !== null) {
    facets.push({ label: t('staffing.laura.threshold'), value: `${input.thresholdPercent} %` })
  }

  const missing: string[] = []
  if (input.thresholdPercent === null && !input.isLoading) missing.push(t('staffing.laura.thresholdMissing'))
  if (input.actualMeasured === false) missing.push(t('staffing.laura.actualMissing'))

  return {
    kind: 'screen',
    label: t('staffing.title'),
    entityId: null,
    facets,
    state: input.isLoading ? 'loading' : 'ready',
    purpose: t('staffing.laura.purpose'),
    ...(missing.length > 0 ? { missing } : {}),
    actions: [t('staffing.laura.action')],
  }
}
