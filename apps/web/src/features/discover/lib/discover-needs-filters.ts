/**
 * #5203 (lot 782) — les filtres de BESOINS de Découvrir : période (Tous par défaut, Récents < 6 mois, Anciens) et nature
 * (recrutement, mission, projet). Un filtre RETIRE ce qui ne correspond pas ; « Tous » ne retire rien et n'est jamais
 * envoyé (aucune borne d'âge, décision 31/10). Miroir du contrat `DISCOVER_NEED_*` de `@bellum/contracts`.
 */
import {
  DISCOVER_NEED_NATURES,
  DISCOVER_NEED_PERIODS,
  type DiscoverNeedNature,
  type DiscoverNeedPeriod,
} from '@bellum/contracts'

export type NeedsPeriod = DiscoverNeedPeriod
export type NeedNature = DiscoverNeedNature
export const NEED_PERIOD_ALL: NeedsPeriod = 'all'
export const NEED_PERIODS: readonly NeedsPeriod[] = DISCOVER_NEED_PERIODS
export const NEED_NATURES: readonly NeedNature[] = DISCOVER_NEED_NATURES

/** Une valeur d'URL ou de lien → une période connue, sinon « Tous » (jamais une valeur devinée). */
export function needsPeriodOf(value: unknown): NeedsPeriod {
  return NEED_PERIODS.find(period => period === value) ?? NEED_PERIOD_ALL
}

export function needNaturesOf(value: unknown): NeedNature[] {
  const wanted = String(value ?? '')
    .split(',')
    .map(part => part.trim())
  return NEED_NATURES.filter(nature => wanted.includes(nature))
}
