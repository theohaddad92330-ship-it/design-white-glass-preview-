import {
  OPEN_PIPELINE_STAGES,
  PIPE_OWNER_WINDOWS,
  PIPE_RISK_THRESHOLDS,
  type ForecastCategory,
  type PipeByOwner,
  type PipeOwnerRow,
  type PipeRiskSignal,
  type PipeWaterfall,
} from '@bellum/contracts'

/**
 * LE CALCUL DU PIPE (L2 Pilotage) — fonctions PURES, sans base ni horloge
 * cachée : le service charge, ces fonctions comptent, et chaque règle se prouve
 * par un test.
 *
 * Tout est NON PONDÉRÉ (doctrine) : des centimes saisis, jamais multipliés par
 * une probabilité. Un montant absent n'est pas 0 : il sort de la somme et se
 * compte à part.
 */

const DAY_MS = 86_400_000
const OPEN_STAGES: ReadonlySet<string> = new Set(OPEN_PIPELINE_STAGES)

export const isOpenPipeStage = (stage: string): boolean => OPEN_STAGES.has(stage)

export interface PipeOpportunity {
  id: string
  accountId: string
  accountName: string
  label: string
  stage: string
  stageEnteredAt: Date
  /** Centimes en euro ; `null` = pas de montant (ou hors euro) — jamais 0. */
  amountCents: number | null
  expectedCloseOn: string | null
  forecastCategory: ForecastCategory | null
  ownerId: string | null
  ownerName: string | null
  firstDetectedAt: Date
  closedAt: Date | null
  outcome: string | null
}

/** Une ligne de `commercial_transitions` (sujet `'opportunity'`). */
export interface PipeStageTransition {
  opportunityId: string
  occurredAt: Date
  fromState: string | null
  toState: string
}

/** Une ligne de `opportunity_field_changes` (champ `amount_cents`). */
export interface PipeAmountChange {
  opportunityId: string
  occurredAt: Date
  fromCents: number | null
  toCents: number | null
}

export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2
}

const byTime = <T extends { occurredAt: Date }>(a: T, b: T): number => a.occurredAt.getTime() - b.occurredAt.getTime()

function groupBy<T extends { opportunityId: string }>(rows: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const list = map.get(row.opportunityId)
    if (list) list.push(row)
    else map.set(row.opportunityId, [row])
  }
  return map
}

/** L'étape à l'instant `t` : la première transition APRÈS `t` dit d'où l'on venait. */
function stageAt(opp: PipeOpportunity, t: Date, transitions: readonly PipeStageTransition[]): string {
  const next = transitions.find(row => row.occurredAt.getTime() > t.getTime())
  // `from_state` null = premier mot du journal : l'opportunité naissait, elle n'était pas dans le pipe.
  return next ? (next.fromState ?? 'detected') : opp.stage
}

function amountAt(opp: PipeOpportunity, t: Date, changes: readonly PipeAmountChange[]): number | null {
  const next = changes.find(row => row.occurredAt.getTime() > t.getTime())
  return next ? next.fromCents : opp.amountCents
}

/**
 * LE WATERFALL — ouverture → + créées → + montées → − baissées → − perdues →
 * − signées → − sorties → clôture.
 *
 * L'ouverture et la clôture se RECONSTRUISENT indépendamment l'une de l'autre
 * (l'état à `from`, l'état à `to`) ; les barres du milieu se déduisent du
 * journal. Que `opening + barres = closing` n'est donc pas une tautologie :
 * c'est un recoupement. Ce qui ne se recoupe pas (journal incomplet, ligne
 * modifiée hors journal) tombe dans `unexplainedCents`, jamais absorbé.
 */
export function computePipeWaterfall(input: {
  opportunities: readonly PipeOpportunity[]
  transitions: readonly PipeStageTransition[]
  amountChanges: readonly PipeAmountChange[]
  from: Date
  to: Date
}): PipeWaterfall {
  const { from, to } = input
  const fromMs = from.getTime()
  const toMs = to.getTime()
  const transitionsBy = groupBy([...input.transitions].sort(byTime))
  const changesBy = groupBy([...input.amountChanges].sort(byTime))

  let openingCents = 0
  let openingCount = 0
  let closingCents = 0
  let closingCount = 0
  let withoutAmountCount = 0
  let createdCents = 0
  let raisedCents = 0
  let loweredCents = 0
  let lostCents = 0
  let signedCents = 0
  let removedCents = 0

  for (const opp of input.opportunities) {
    const transitions = transitionsBy.get(opp.id) ?? []
    const changes = changesBy.get(opp.id) ?? []
    const existsAt = (t: Date): boolean => opp.firstDetectedAt.getTime() <= t.getTime()

    if (existsAt(from) && isOpenPipeStage(stageAt(opp, from, transitions))) {
      openingCents += amountAt(opp, from, changes) ?? 0
      openingCount += 1
    }
    if (existsAt(to) && isOpenPipeStage(stageAt(opp, to, transitions))) {
      const amount = amountAt(opp, to, changes)
      closingCents += amount ?? 0
      closingCount += 1
      if (amount === null) withoutAmountCount += 1
    }

    // ── Les barres : on rejoue ce qui s'est passé dans (from, to], dans l'ordre.
    type Event =
      | { at: number; order: 0 }
      | { at: number; order: 1; toState: string }
      | { at: number; order: 2; toCents: number | null }
    const events: Event[] = []
    const born = opp.firstDetectedAt.getTime() > fromMs && opp.firstDetectedAt.getTime() <= toMs
    if (born) events.push({ at: opp.firstDetectedAt.getTime(), order: 0 })
    for (const row of transitions) {
      const at = row.occurredAt.getTime()
      if (at > fromMs && at <= toMs) events.push({ at, order: 1, toState: row.toState })
    }
    for (const row of changes) {
      const at = row.occurredAt.getTime()
      if (at > fromMs && at <= toMs) events.push({ at, order: 2, toCents: row.toCents })
    }
    if (events.length === 0) continue
    events.sort((a, b) => a.at - b.at || a.order - b.order)

    let stage = existsAt(from) ? stageAt(opp, from, transitions) : 'detected'
    let amount: number | null = existsAt(from) ? amountAt(opp, from, changes) : null
    for (const event of events) {
      if (event.order === 0) {
        const first = transitions[0]
        stage = first ? (first.fromState ?? 'detected') : opp.stage
        amount = amountAt(opp, opp.firstDetectedAt, changes)
        if (isOpenPipeStage(stage)) createdCents += amount ?? 0
      } else if (event.order === 1) {
        const wasOpen = isOpenPipeStage(stage)
        const nowOpen = isOpenPipeStage(event.toState)
        if (!wasOpen && nowOpen) createdCents += amount ?? 0
        if (wasOpen && !nowOpen) {
          if (event.toState === 'won') signedCents += amount ?? 0
          else if (event.toState === 'lost') lostCents += amount ?? 0
          else removedCents += amount ?? 0
        }
        stage = event.toState
      } else {
        const next = event.toCents
        if (isOpenPipeStage(stage)) {
          const delta = (next ?? 0) - (amount ?? 0)
          if (delta > 0) raisedCents += delta
          else loweredCents += -delta
        }
        amount = next
      }
    }
  }

  const explained = openingCents + createdCents + raisedCents - loweredCents - lostCents - signedCents - removedCents
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    openingCents,
    createdCents,
    raisedCents,
    loweredCents,
    lostCents,
    signedCents,
    removedCents,
    closingCents,
    unexplainedCents: closingCents - explained,
    openingCount,
    closingCount,
    withoutAmountCount,
  }
}

interface RiskContext {
  now: Date
  /** Dernière activité LIÉE à l'opportunité ; `null` = aucune connue → aucun signal. */
  lastActivityAt: Date | null
  closeDatePushes: number
  lastAmountLowering: { at: Date; fromCents: number; toCents: number } | null
  /** Médiane des jours-dans-le-stade des ouvertes du même stade ; `null` sous l'échantillon minimal. */
  stageMedianDays: number | null
  daysInStage: number
}

const signal = (over: Partial<PipeRiskSignal> & Pick<PipeRiskSignal, 'kind'>): PipeRiskSignal => ({
  days: null,
  count: null,
  fromCents: null,
  toCents: null,
  ...over,
})

/**
 * LES SIGNAUX — des FAITS, jamais un score. Chaque fait absent ne fait aucune
 * ligne : sans activité connue, on ne dit pas « aucune activité ».
 */
export function computeRiskSignals(opp: PipeOpportunity, ctx: RiskContext): PipeRiskSignal[] {
  const out: PipeRiskSignal[] = []
  const { now } = ctx

  if (ctx.lastActivityAt) {
    const days = Math.floor((now.getTime() - ctx.lastActivityAt.getTime()) / DAY_MS)
    if (days >= PIPE_RISK_THRESHOLDS.noActivityDays) out.push(signal({ kind: 'no_activity', days }))
  }

  if (opp.expectedCloseOn) {
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    const planned = Date.parse(`${opp.expectedCloseOn}T00:00:00.000Z`)
    const days = Math.floor((today - planned) / DAY_MS)
    if (Number.isFinite(days) && days > 0) out.push(signal({ kind: 'close_overdue', days }))
  }

  if (ctx.closeDatePushes >= PIPE_RISK_THRESHOLDS.closeDatePushes) {
    out.push(signal({ kind: 'close_pushed', count: ctx.closeDatePushes }))
  }

  const lowering = ctx.lastAmountLowering
  if (lowering && now.getTime() - lowering.at.getTime() <= PIPE_RISK_THRESHOLDS.amountLoweredWindowDays * DAY_MS) {
    out.push(signal({ kind: 'amount_lowered', fromCents: lowering.fromCents, toCents: lowering.toCents }))
  }

  if (ctx.stageMedianDays !== null && ctx.daysInStage > ctx.stageMedianDays) {
    out.push(signal({ kind: 'stage_stale', days: ctx.daysInStage }))
  }
  return out
}

/**
 * PAR COMMERCIAL — sur le pipe NATIF (données Bellum, jamais le CRM tiers).
 *
 *  · taux de gain = signées ÷ (signées + perdues) sur 90 j glissants, dénominateur
 *    rendu ; `null` sous la base minimale (jamais un % sur 3 dossiers) ;
 *  · cycle médian = création → signature des signées des 180 derniers jours.
 * Un abandon n'est pas une perte : il ne compte pas dans le taux.
 */
export function computePipeByOwner(input: {
  opportunities: readonly PipeOpportunity[]
  from: Date
  to: Date
}): PipeByOwner {
  const toMs = input.to.getTime()
  const fromMs = input.from.getTime()
  const winSince = toMs - PIPE_OWNER_WINDOWS.winRateDays * DAY_MS
  const cycleSince = toMs - PIPE_OWNER_WINDOWS.salesCycleDays * DAY_MS

  const groups = new Map<string, PipeOpportunity[]>()
  for (const opp of input.opportunities) {
    const key = opp.ownerId ?? ''
    const list = groups.get(key)
    if (list) list.push(opp)
    else groups.set(key, [opp])
  }

  const owners: PipeOwnerRow[] = []
  for (const [key, list] of groups) {
    const open = list.filter(opp => isOpenPipeStage(opp.stage))
    const closedAt = (opp: PipeOpportunity): number => opp.closedAt?.getTime() ?? Number.NaN
    const signed = list.filter(opp => opp.outcome === 'won' && closedAt(opp) > fromMs && closedAt(opp) <= toMs)
    const won = list.filter(opp => opp.outcome === 'won' && closedAt(opp) > winSince && closedAt(opp) <= toMs).length
    const lost = list.filter(opp => opp.outcome === 'lost' && closedAt(opp) > winSince && closedAt(opp) <= toMs).length
    const cycles = list
      .filter(opp => opp.outcome === 'won' && closedAt(opp) > cycleSince && closedAt(opp) <= toMs)
      .map(opp => Math.round((closedAt(opp) - opp.firstDetectedAt.getTime()) / DAY_MS))
    const denominator = won + lost
    if (open.length === 0 && signed.length === 0 && denominator === 0 && cycles.length === 0) continue
    owners.push({
      ownerId: key === '' ? null : key,
      ownerName: list.find(opp => opp.ownerName)?.ownerName ?? null,
      openCount: open.length,
      openCents: open.reduce((sum, opp) => sum + (opp.amountCents ?? 0), 0),
      signedCount: signed.length,
      signedCents: signed.reduce((sum, opp) => sum + (opp.amountCents ?? 0), 0),
      winRate: denominator >= PIPE_OWNER_WINDOWS.winRateMinBase ? won / denominator : null,
      winRateWon: won,
      winRateLost: lost,
      winRateDays: PIPE_OWNER_WINDOWS.winRateDays,
      medianCycleDays: medianOf(cycles),
      cycleSample: cycles.length,
      cycleDays: PIPE_OWNER_WINDOWS.salesCycleDays,
    })
  }
  owners.sort((a, b) => b.openCents - a.openCents)
  return { from: input.from.toISOString(), to: input.to.toISOString(), owners }
}
