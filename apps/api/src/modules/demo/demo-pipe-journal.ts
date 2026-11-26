import { DEMO_PIPE_L2, type DemoPipeDeal, type DemoPipeWhen } from './demo-dataset'

const DAY_MS = 86_400_000

export interface DemoPipeRow {
  deal: DemoPipeDeal
  firstDetectedAt: Date
  stageEnteredAt: Date
  closedAt: Date | null
  /** Date prévue courante (jour ISO) ; `null` = non fixée. */
  expectedCloseOn: string | null
  transitions: { from: string | null; to: string; at: Date }[]
  amountChanges: { fromCents: number | null; toCents: number | null; at: Date }[]
  closeDateChanges: { from: string; to: string; at: Date }[]
  lastActivityAt: Date | null
}

/**
 * Résout le jeu de données L2 (relatif à `now`) en dates absolues. PUR : le
 * semis (`DemoSeedService.seedPipeDeclarations`) et la garde de cohérence
 * (`demo-pipe-journal.spec.ts`) lisent exactement la même chose.
 */
export function resolveDemoPipeRow(deal: DemoPipeDeal, now: Date): DemoPipeRow {
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  const at = (when: DemoPipeWhen): Date =>
    typeof when === 'number'
      ? new Date(now.getTime() - when * DAY_MS)
      : new Date(monthStart + when.m * (now.getTime() - monthStart))
  const day = (offsetDays: number): string => new Date(now.getTime() + offsetDays * DAY_MS).toISOString().slice(0, 10)

  return {
    deal,
    firstDetectedAt: at(deal.created),
    stageEnteredAt: at(deal.stageEntered),
    closedAt: deal.closed === undefined ? null : at(deal.closed),
    expectedCloseOn: deal.expectedCloseInDays === null ? null : day(deal.expectedCloseInDays),
    transitions: deal.transitions.map(step => ({ from: step.from, to: step.to, at: at(step.at) })),
    amountChanges: deal.amountChanges.map(change => ({ ...change, at: at(change.at) })),
    closeDateChanges: deal.closeDateChanges.map(change => ({
      from: day(change.fromInDays),
      to: day(change.toInDays),
      at: at(change.at),
    })),
    lastActivityAt: deal.lastActivityDaysAgo === undefined ? null : at(deal.lastActivityDaysAgo),
  }
}

export function buildDemoPipeRows(now: Date): DemoPipeRow[] {
  return DEMO_PIPE_L2.deals.map(deal => resolveDemoPipeRow(deal, now))
}
