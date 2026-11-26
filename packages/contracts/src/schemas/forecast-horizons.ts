import { z } from 'zod'
import { RUNNING_MISSION_STATUSES } from './account-missions.js'

/**
 * #2425 — LE PRÉVISIONNEL PAR HORIZON : quatre horizons, sept composantes,
 * quatre scénarios, sept décisions, une vue manager.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE MODULE REFUSE, ET POURQUOI (doctrine `c26_probabilite`)
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun montant n'est multiplié par une chance de signature — refusé six fois.
 * Un SCÉNARIO est donc une SOMME de composantes classées par STATUT DÉCLARÉ :
 *  - `committed` : le carnet signé, jusqu'à la date de fin CONNUE ;
 *  - `baseline`  : + les renouvellements DÉCLARÉS (signés ou annoncés) ;
 *  - `upside`    : + le pipe vivant daté dans l'horizon, à son montant NOMINAL ;
 *  - `downside`  : le carnet signé MOINS les missions DÉCLARÉES bloquées.
 * Chaque scénario porte ses HYPOTHÈSES écrites : c'est ce qui remplace utilement
 * le chiffre pondéré — on sait ce qu'on suppose, au lieu d'un taux invérifiable.
 *
 * La CONFIANCE (#2425.5) n'est pas un pourcentage : elle nomme sa BASE (contrat,
 * déclaration, montant nominal, facture) et trois AXES — contrat, source,
 * historique — dont chacun est `yes`, `no` ou `not_measured` (nommé, jamais
 * compté).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX DEVISES NE S'ADDITIONNENT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Chaque total est une liste « un montant par devise ». Aucun taux de change
 * n'est inventé. Une ligne SANS devise est lue en euros (les lignes historiques
 * le sont) — et c'est une HYPOTHÈSE écrite, comptée (`assumedCurrency`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * « NON MESURÉ » N'EST PAS « 0 »
 * ─────────────────────────────────────────────────────────────────────────────
 * Un total sans aucune ligne chiffrable vaut `null`, jamais `[]` lu « 0 € ». Une
 * ligne sans montant est COMPTÉE à part (`withoutAmount`).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #2425.12 — AUCUN DOUBLE COMPTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Une ligne est identifiée par sa `key` (`mission:<id>`, `opportunity:<id>`,
 * `invoice:<mission>:<mois>`) : remontée deux fois dans la même composante, elle
 * ne compte qu'une fois. Une opportunité DEVENUE mission (`becameKey`) sort du
 * pipe dès que sa mission est dans le carnet ou les renouvellements — le même
 * contrat ne se compte pas à la fois « espéré » et « signé ».
 */

/**
 * #2875 — les missions qui PRODUISENT dans le prévisionnel : les statuts « en
 * cours » du contrat, moins `paused` (une mission suspendue ne facture rien).
 * Un seul endroit (GA-26) : `ForecastHorizonsService` ET la sonde de Laura le lisent.
 */
export const FORECAST_RUNNING_MISSION_STATUSES = RUNNING_MISSION_STATUSES.filter(status => status !== 'paused')

/** #2875 — ce que le scénario bas retire : un renouvellement DÉCLARÉ bloqué, ou une mission passée « à risque ». */
export const FORECAST_DECLARED_BLOCKED_RENEWAL_STATUS = 'bloque'
export const FORECAST_DECLARED_BLOCKED_MISSION_STATUS = 'at_risk'

export const FORECAST_HORIZONS = ['week', 'month', 'quarter', 'semester'] as const
export const forecastHorizonSchema = z.enum(FORECAST_HORIZONS)
export type ForecastHorizon = z.infer<typeof forecastHorizonSchema>

/** #2425.3 — les sept composantes, du carnet au cash. L'ordre est celui de la chaîne. */
export const FORECAST_COMPONENTS = [
  /** Carnet signé : missions en cours, jusqu'à leur fin connue. */
  'backlog',
  /** Renouvellements DÉCLARÉS (signés, ou annoncés par le client). */
  'renewal',
  /** Pipe vivant daté dans l'horizon, à son montant nominal. */
  'pipeline',
  /** Production déjà faite, pas encore facturée — la facture prévue. */
  'toInvoice',
  /** Facturé, non réglé, échéance dans l'horizon — le cash prévu. */
  'receivable',
  /** Facturé, non réglé, échéance dépassée. */
  'overdue',
  /** Facturé, contesté — se discute, ne se relance pas. */
  'disputed',
] as const
export const forecastComponentSchema = z.enum(FORECAST_COMPONENTS)
export type ForecastComponent = z.infer<typeof forecastComponentSchema>

export const FORECAST_SCENARIOS = ['committed', 'baseline', 'upside', 'downside'] as const
export type ForecastScenario = (typeof FORECAST_SCENARIOS)[number]

/** Les composantes qu'un scénario SOMME — rien d'autre n'entre dans son montant. */
const SCENARIO_COMPONENTS: Record<ForecastScenario, readonly ForecastComponent[]> = {
  committed: ['backlog'],
  baseline: ['backlog', 'renewal'],
  upside: ['backlog', 'renewal', 'pipeline'],
  downside: ['backlog'],
}

export const FORECAST_HYPOTHESES = [
  'signedOnly',
  'knownEndDate',
  'weekdaysFullTime',
  'renewalsDeclared',
  'pipelineNominal',
  'blockedStops',
  'currencyAssumedEur',
  'deduplicated',
] as const
export type ForecastHypothesis = (typeof FORECAST_HYPOTHESES)[number]

const SCENARIO_HYPOTHESES: Record<ForecastScenario, readonly ForecastHypothesis[]> = {
  committed: ['signedOnly', 'knownEndDate', 'weekdaysFullTime'],
  baseline: ['signedOnly', 'knownEndDate', 'weekdaysFullTime', 'renewalsDeclared'],
  upside: ['signedOnly', 'knownEndDate', 'weekdaysFullTime', 'renewalsDeclared', 'pipelineNominal'],
  downside: ['signedOnly', 'knownEndDate', 'weekdaysFullTime', 'blockedStops'],
}

/** #2425.9 — les sept décisions qu'un prévisionnel peut proposer. */
export const FORECAST_DECISIONS = [
  'secureRenewal',
  'unblockMission',
  'accelerateInvoicing',
  'chaseOverdue',
  'resolveDispute',
  'completePipeline',
  'staffBench',
] as const
export type ForecastDecision = (typeof FORECAST_DECISIONS)[number]

/** #2425.10 — la vue manager ne montre jamais plus de cinq lignes. */
export const MANAGER_VIEW_LIMIT = 5

/** #2425.11 — les dix scénarios de recette, chacun tenu par un test nommé. */
export const FORECAST_RECETTE_SCENARIOS = [
  'noData',
  'multiCurrency',
  'assumedCurrency',
  'correction',
  'withoutAmount',
  'pipelineBecameMission',
  'duplicateLine',
  'blockedMission',
  'overdueAndDispute',
  'horizonBounds',
] as const

const moneySchema = z.object({ currency: z.string(), amountCents: z.number().int() })
export type Money = z.infer<typeof moneySchema>
/** `null` = rien de chiffrable. Jamais `[]` qu'un écran lirait « 0 ». */
const amountsSchema = z.array(moneySchema).nullable()

const confidenceAxisSchema = z.object({
  axis: z.enum(['contract', 'source', 'history']),
  state: z.enum(['yes', 'no', 'not_measured']),
})

const componentTotalSchema = z.object({
  component: forecastComponentSchema,
  amounts: amountsSchema,
  count: z.number().int().nonnegative(),
  withoutAmount: z.number().int().nonnegative(),
  assumedCurrency: z.number().int().nonnegative(),
  confidence: z.object({
    basis: z.enum(['contract', 'declaration', 'nominal', 'invoice']),
    axes: z.array(confidenceAxisSchema),
  }),
})

const scenarioTotalSchema = z.object({
  scenario: z.enum(FORECAST_SCENARIOS),
  components: z.array(forecastComponentSchema),
  amounts: amountsSchema,
  hypotheses: z.array(z.enum(FORECAST_HYPOTHESES)),
  /** Lignes sorties du scénario par déduplication (#2425.12). */
  deduplicated: z.number().int().nonnegative(),
  /** Lignes retirées par l'hypothèse du scénario (bloquées, pour le bas). */
  excluded: z.number().int().nonnegative(),
  withoutAmount: z.number().int().nonnegative(),
})

const decisionSchema = z.object({
  decision: z.enum(FORECAST_DECISIONS),
  count: z.number().int().nonnegative(),
  amounts: amountsSchema,
})
export type ForecastDecisionLine = z.infer<typeof decisionSchema>

const capacitySchema = z.object({
  /** Jours déjà engagés — la capacité RÉSERVÉE. */
  reservedDays: z.number().nullable(),
  availableDays: z.number().nullable(),
  /** Consultants sans affectation — les TROUS. */
  bench: z.number().int().nonnegative().nullable(),
  /** Postes ouverts sur des besoins non staffés. */
  uncoveredNeeds: z.number().int().nonnegative().nullable(),
})
type HorizonCapacity = z.infer<typeof capacitySchema>

export const horizonForecastSchema = z.object({
  horizon: forecastHorizonSchema,
  window: z.object({ from: z.string(), until: z.string() }),
  components: z.array(componentTotalSchema),
  scenarios: z.array(scenarioTotalSchema),
  /** #2425.6 — trois montants distincts, jamais fondus. */
  money: z.object({
    revenue: z.object({ amounts: amountsSchema }),
    invoicing: z.object({ amounts: amountsSchema }),
    cash: z.object({ amounts: amountsSchema }),
  }),
  /** #2425.8 — pourquoi le cash n'est pas le CA : des causes chiffrées. */
  gap: z.object({
    causes: z.array(
      z.object({
        cause: z.enum(['invoicingDelay', 'notYetInvoiced', 'overdue', 'disputed']),
        amounts: z.array(moneySchema),
      }),
    ),
  }),
  decisions: z.array(decisionSchema),
  capacity: capacitySchema.nullable(),
  /**
   * #2783 (épopée « simulation impact avenant ») — DONT AVENANTS, à l'échelle
   * de l'espace : les avenants dont la date d'effet tombe dans l'horizon,
   * comptés — jamais chiffrés (`new_term` est un JSON libre, sans contrat de
   * clé vérifiable ; en extraire un montant serait deviner, doctrine « un
   * contrat d'API non vérifiable ne se devine pas »). `simulated` = encore
   * `proposed`, NOMMÉ séparément — jamais fondu avec `accepted`
   * (`accepted`/`active`) : aucune probabilité, aucune pondération.
   */
  amendments: z.object({
    total: z.number().int().nonnegative(),
    accepted: z.number().int().nonnegative(),
    simulated: z.number().int().nonnegative(),
  }),
})
export type HorizonForecast = z.infer<typeof horizonForecastSchema>

/** Une ligne persistée, normalisée par le service avant le calcul. */
export type ForecastItem = {
  key: string
  component: ForecastComponent
  amountCents: number | null
  /** Montant CORRIGÉ par une personne — gagne toujours sur le calculé. */
  declaredAmountCents: number | null
  currency: string | null
  /** Pour une opportunité : la clé de la mission qu'elle est devenue. */
  becameKey: string | null
  /** Mission dont le renouvellement est déclaré `bloque`. */
  declaredBlocked: boolean
  /** Mission qui finit dans l'horizon sans suite déclarée. */
  renewalOpen: boolean
}

const DAY_MS = 86_400_000

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** La fenêtre d'un horizon : d'aujourd'hui (inclus) à la borne (exclue), en jours UTC. */
export function horizonWindow(horizon: ForecastHorizon, now: Date): { from: string; until: string } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const end =
    horizon === 'week'
      ? new Date(start.getTime() + 7 * DAY_MS)
      : new Date(
          Date.UTC(
            start.getUTCFullYear(),
            start.getUTCMonth() + (horizon === 'month' ? 1 : horizon === 'quarter' ? 3 : 6),
            start.getUTCDate(),
          ),
        )
  return { from: isoDay(start), until: isoDay(end) }
}

/** Jours ouvrés (lundi → vendredi) de `from` inclus à `until` exclu. Jours fériés non retirés (hypothèse écrite). */
export function weekdaysBetween(from: string, until: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${until}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0
  let count = 0
  for (let cursor = start; cursor < end; cursor += DAY_MS) {
    const day = new Date(cursor).getUTCDay()
    if (day !== 0 && day !== 6) count += 1
  }
  return count
}

const CONFIDENCE: Record<ForecastComponent, z.infer<typeof componentTotalSchema>['confidence']> = {
  backlog: {
    basis: 'contract',
    axes: [
      { axis: 'contract', state: 'yes' },
      { axis: 'source', state: 'yes' },
      { axis: 'history', state: 'not_measured' },
    ],
  },
  renewal: {
    basis: 'declaration',
    axes: [
      { axis: 'contract', state: 'no' },
      { axis: 'source', state: 'yes' },
      { axis: 'history', state: 'not_measured' },
    ],
  },
  pipeline: {
    basis: 'nominal',
    axes: [
      { axis: 'contract', state: 'no' },
      { axis: 'source', state: 'no' },
      { axis: 'history', state: 'not_measured' },
    ],
  },
  toInvoice: {
    basis: 'contract',
    axes: [
      { axis: 'contract', state: 'yes' },
      { axis: 'source', state: 'yes' },
      { axis: 'history', state: 'not_measured' },
    ],
  },
  receivable: {
    basis: 'invoice',
    axes: [
      { axis: 'contract', state: 'yes' },
      { axis: 'source', state: 'yes' },
      { axis: 'history', state: 'not_measured' },
    ],
  },
  overdue: {
    basis: 'invoice',
    axes: [
      { axis: 'contract', state: 'yes' },
      { axis: 'source', state: 'yes' },
      { axis: 'history', state: 'no' },
    ],
  },
  disputed: {
    basis: 'invoice',
    axes: [
      { axis: 'contract', state: 'yes' },
      { axis: 'source', state: 'no' },
      { axis: 'history', state: 'no' },
    ],
  },
}

function amountOf(entry: ForecastItem): number | null {
  return entry.declaredAmountCents ?? entry.amountCents
}

/** Somme PAR DEVISE ; `null` quand aucune ligne n'est chiffrable. */
function sumByCurrency(entries: readonly ForecastItem[]): Money[] | null {
  const totals = new Map<string, number>()
  for (const entry of entries) {
    const amount = amountOf(entry)
    if (amount === null) continue
    const currency = entry.currency ?? 'EUR'
    totals.set(currency, (totals.get(currency) ?? 0) + amount)
  }
  if (totals.size === 0) return null
  return [...totals.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, amountCents]) => ({ currency, amountCents }))
}

/** La même ligne remontée deux fois dans la même composante ne compte qu'une fois. */
function uniqueItems(items: readonly ForecastItem[]): ForecastItem[] {
  const seen = new Set<string>()
  const kept: ForecastItem[] = []
  for (const entry of items) {
    const id = `${entry.component}|${entry.key}`
    if (seen.has(id)) continue
    seen.add(id)
    kept.push(entry)
  }
  return kept
}

function largest(amounts: Money[] | null): number {
  if (!amounts) return -1
  return Math.max(...amounts.map(entry => entry.amountCents))
}

function decisionLine(decision: ForecastDecision, entries: readonly ForecastItem[]): ForecastDecisionLine | null {
  if (entries.length === 0) return null
  return { decision, count: entries.length, amounts: sumByCurrency(entries) }
}

export function computeHorizonForecast(input: {
  horizon: ForecastHorizon
  now: Date
  items: readonly ForecastItem[]
  capacity: HorizonCapacity | null
  /** #2783 — comptés par l'appelant (statut réel en base), jamais devinés ici. */
  amendments?: { accepted: number; simulated: number }
}): HorizonForecast {
  const items = uniqueItems(input.items)
  const of = (component: ForecastComponent) => items.filter(entry => entry.component === component)

  const components = FORECAST_COMPONENTS.map(component => {
    const entries = of(component)
    return {
      component,
      amounts: sumByCurrency(entries),
      count: entries.length,
      withoutAmount: entries.filter(entry => amountOf(entry) === null).length,
      assumedCurrency: entries.filter(entry => entry.currency === null && amountOf(entry) !== null).length,
      confidence: CONFIDENCE[component],
    }
  })

  const scenarios = FORECAST_SCENARIOS.map(scenario => {
    const members = SCENARIO_COMPONENTS[scenario]
    const pool = items.filter(entry => members.includes(entry.component))
    // #2425.12 — une opportunité devenue mission sort du pipe dès que sa
    // mission est déjà comptée dans le même scénario.
    const missionKeys = new Set(pool.filter(entry => entry.component !== 'pipeline').map(entry => entry.key))
    const deduplicated = pool.filter(
      entry => entry.component === 'pipeline' && entry.becameKey !== null && missionKeys.has(entry.becameKey),
    )
    const blocked = scenario === 'downside' ? pool.filter(entry => entry.declaredBlocked) : []
    const kept = pool.filter(entry => !deduplicated.includes(entry) && !blocked.includes(entry))
    const hypotheses: ForecastHypothesis[] = [...SCENARIO_HYPOTHESES[scenario]]
    if (kept.some(entry => entry.currency === null && amountOf(entry) !== null)) hypotheses.push('currencyAssumedEur')
    if (deduplicated.length > 0) hypotheses.push('deduplicated')
    return {
      scenario,
      components: [...members],
      amounts: sumByCurrency(kept),
      hypotheses,
      deduplicated: deduplicated.length,
      excluded: blocked.length,
      withoutAmount: kept.filter(entry => amountOf(entry) === null).length,
    }
  })

  const revenue = sumByCurrency([...of('backlog'), ...of('renewal')])
  const causes: HorizonForecast['gap']['causes'] = []
  const cause = (name: HorizonForecast['gap']['causes'][number]['cause'], amounts: Money[] | null) => {
    if (amounts) causes.push({ cause: name, amounts })
  }
  // La production de l'horizon se facture en fin de mois et s'encaisse à
  // l'échéance : elle ne devient pas du cash DANS l'horizon. C'est le délai de
  // facturation, et il se chiffre par le CA lui-même.
  cause('invoicingDelay', revenue)
  cause('notYetInvoiced', sumByCurrency(of('toInvoice')))
  cause('overdue', sumByCurrency(of('overdue')))
  cause('disputed', sumByCurrency(of('disputed')))

  const backlog = of('backlog')
  const pipelineIncomplete = of('pipeline').filter(entry => amountOf(entry) === null)
  const bench = input.capacity?.bench ?? 0
  const decisions = [
    decisionLine(
      'secureRenewal',
      backlog.filter(entry => entry.renewalOpen),
    ),
    decisionLine(
      'unblockMission',
      backlog.filter(entry => entry.declaredBlocked),
    ),
    decisionLine('accelerateInvoicing', of('toInvoice')),
    decisionLine('chaseOverdue', of('overdue')),
    decisionLine('resolveDispute', of('disputed')),
    pipelineIncomplete.length > 0
      ? { decision: 'completePipeline' as const, count: pipelineIncomplete.length, amounts: null }
      : null,
    bench > 0 ? { decision: 'staffBench' as const, count: bench, amounts: null } : null,
  ]
    .filter((line): line is ForecastDecisionLine => line !== null)
    // Ce qui pèse le plus d'abord ; à montant égal, l'ordre de la chaîne.
    .map((line, index) => ({ line, index }))
    .sort((left, right) => largest(right.line.amounts) - largest(left.line.amounts) || left.index - right.index)
    .map(({ line }) => line)

  return {
    horizon: input.horizon,
    window: horizonWindow(input.horizon, input.now),
    components,
    scenarios,
    money: {
      revenue: { amounts: revenue },
      invoicing: { amounts: sumByCurrency(of('toInvoice')) },
      cash: { amounts: sumByCurrency(of('receivable')) },
    },
    gap: { causes },
    decisions,
    capacity: input.capacity,
    amendments: {
      total: (input.amendments?.accepted ?? 0) + (input.amendments?.simulated ?? 0),
      accepted: input.amendments?.accepted ?? 0,
      simulated: input.amendments?.simulated ?? 0,
    },
  }
}

/**
 * #2425.10 — la vue manager : les cinq premières lignes, et le compte de ce qui
 * est replié. c76 — le rôle change l'ORDRE, jamais le CONTENU : `hidden` rend
 * tout ce qui n'est pas montré, et l'écran dit combien de lignes attendent.
 */
export function managerView(decisions: readonly ForecastDecisionLine[]): {
  shown: ForecastDecisionLine[]
  hidden: ForecastDecisionLine[]
  folded: number
} {
  const shown = decisions.slice(0, MANAGER_VIEW_LIMIT)
  const hidden = decisions.slice(MANAGER_VIEW_LIMIT)
  return { shown, hidden, folded: hidden.length }
}
