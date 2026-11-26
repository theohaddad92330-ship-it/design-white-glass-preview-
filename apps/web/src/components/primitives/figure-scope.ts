import type { CockpitSource } from '@bellum/contracts'

/** #4298.2 — la portée d'un chiffre : sa période et sa source (voir `FigureScope`). */
type FigurePeriod =
  | { kind: 'now' }
  | { kind: 'lastDays'; days: number }
  | { kind: 'nextDays'; days: number }
  | { kind: 'month'; month: string }

/** Les sources d'un bloc (`CockpitSource`) + celles qu'un chiffre seul peut porter. */
type FigureSource = CockpitSource | 'portfolio' | 'deals' | 'workspace'

export interface FigureScopeValue {
  period: FigurePeriod
  sources: FigureSource[]
}

export const FIGURE_SOURCES: ReadonlySet<string> = new Set<FigureSource>([
  'bellum',
  'crm',
  'mailbox',
  'calendar',
  'public_registry',
  'portfolio',
  'deals',
  'workspace',
])

export function figureScopeIsComplete(scope: FigureScopeValue | null | undefined): boolean {
  const period = scope?.period
  if (!period) return false
  if (period.kind === 'lastDays' || period.kind === 'nextDays') return Number.isInteger(period.days) && period.days > 0
  if (period.kind === 'month') return period.month.length > 0
  return period.kind === 'now'
}
