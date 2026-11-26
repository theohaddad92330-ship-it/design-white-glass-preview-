import { z } from 'zod'
import { OPEN_PIPELINE_STAGES, PROJECT_STAGES, type ProjectStage } from './project.js'
import { SHARED_BASE_MIN_WORKSPACES } from './shared-anonymous-base.js'

/**
 * #4016 L1 — LA PROBABILITÉ AFFICHÉE, CALIBRÉE, SOUS-TENDUE PAR SES AXES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * RENVERSEMENT DATÉ — 11/10/2026, DÉCISION LOUIS (épopée #4016, lot L1)
 * ─────────────────────────────────────────────────────────────────────────────
 * `c26_probabilite` refusait toute probabilité affichée — six fois. Elle est
 * levée, À UNE CONDITION que ce module rend structurelle : une probabilité ne
 * voyage QUE dans l'enveloppe {@link calibratedProbabilitySchema}, qui porte
 *  - sa MÉTHODE nommée ({@link DEAL_PROBABILITY_METHOD}) ;
 *  - son INTERVALLE (crédible à 80 %), jamais un chiffre seul ;
 *  - ses AXES — le stade, l'historique de l'espace, la base commune —, chacun
 *    avec les comptes qui le fondent ;
 *  - ses axes NON ÉVALUABLES nommés, sortis du dénominateur (aucun
 *    pseudo-compte inventé) ;
 *  - `null` quand trop peu d'issues réelles la fondent — « non mesuré » n'est
 *    jamais 0.
 * Un nombre nu, sans axes, sans intervalle ou sans méthode ne passe pas le
 * schéma : c'est ce que les gardes GA-64 / GA-376 / GA-26 relisent.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA MÉTHODE — `beta_binomial_stage_v1`
 * ─────────────────────────────────────────────────────────────────────────────
 * Pour une affaire au stade S : parmi les affaires CLOSES de l'espace (gagnées
 * ou perdues — une mise en veille n'est pas une issue, `DECIDED_STAGES`), celles
 * qui avaient ATTEINT S. Une gagnée a traversé tout le pipe ; une perdue compte
 * jusqu'au plus haut stade qu'on lui connaît (journal des transitions). Une
 * perdue dont on ignore le parcours ne compte qu'au premier stade du pipe —
 * hypothèse écrite, prudente : elle n'abaisse pas les stades qu'elle n'a peut-
 * être jamais vus.
 *
 * A priori : Beta(1, 1) (aucune opinion), plus — si la base anonyme commune
 * atteint trois espaces sur une dimension du compte — ses cas gagnés / perdus,
 * ramenés à {@link SHARED_PRIOR_MAX_OBSERVATIONS} pseudo-observations au plus :
 * la base commune ÉCLAIRE l'espace, elle ne le remplace pas. ⚠️ Elle INCLUT
 * l'espace qui demande (c92 : la contribution par espace n'est pas stockée) —
 * c'est pourquoi elle est bornée.
 *
 * Le chiffre est la moyenne a posteriori ; l'intervalle, les quantiles 10 % et
 * 90 % de la loi Beta a posteriori.
 *
 * ⚠️ Aucun critère protégé n'entre (c58) : le calcul ne lit QUE le stade, les
 * issues d'affaires et des agrégats d'entreprises (secteur, taille, position de
 * groupe). Aucune personne.
 *
 * ⚠️ Jamais persistée (tranché sans Louis, 11/10) : elle se calcule à la
 * lecture, sur les issues du jour. Une probabilité figée en base périmerait sans
 * son calibrage — GA-64 refuse toujours la colonne.
 */

export const DEAL_PROBABILITY_METHOD = 'beta_binomial_stage_v1' as const

/** Le niveau de l'intervalle crédible affiché. */
const INTERVAL_LEVEL = 0.8

/** La base commune pèse au plus dix affaires : elle éclaire, l'espace décide. */
const SHARED_PRIOR_MAX_OBSERVATIONS = 10

/** Sous cinq observations, la probabilité n'est pas mesurée — `null`. */
const DEFAULT_MIN_OBSERVATIONS = 5

const PROBABILITY_AXES = ['stage', 'workspace_history', 'shared_base'] as const
const probabilityAxisKeySchema = z.enum(PROBABILITY_AXES)

const probabilityAxisSchema = z.object({
  key: probabilityAxisKeySchema,
  evaluable: z.boolean(),
  /**
   * Un CODE, jamais une phrase : le stade pour `stage`, la dimension de la base
   * commune retenue (`sector`, `size`, `group_role`) pour `shared_base`, sinon
   * la raison de l'absence. L'écran traduit.
   */
  reason: z.string().regex(/^[a-z0-9_]+$/),
  won: z.number().nonnegative().nullable(),
  lost: z.number().nonnegative().nullable(),
  /** Pour `shared_base` : la part de ses cas retenue (≤ 1). `null` ailleurs. */
  weight: z.number().min(0).max(1).nullable(),
})
type ProbabilityAxis = z.infer<typeof probabilityAxisSchema>

/**
 * L'ENVELOPPE — la seule forme sous laquelle une probabilité voyage. Elle sait
 * dire NON : un chiffre sans intervalle, sans axe fondé sur des issues réelles,
 * sans méthode, ou qui tait un axe non évaluable, est refusé.
 */
export const calibratedProbabilitySchema = z
  .object({
    method: z.literal(DEAL_PROBABILITY_METHOD),
    value: z.number().min(0).max(1).nullable(),
    interval: z
      .object({ level: z.literal(INTERVAL_LEVEL), low: z.number().min(0).max(1), high: z.number().min(0).max(1) })
      .nullable(),
    /** Issues réelles + pseudo-observations de la base commune. */
    observations: z.number().nonnegative(),
    axes: z.array(probabilityAxisSchema).min(1),
    unevaluable_axes: z.array(probabilityAxisKeySchema),
    not_measured_reason: z.enum(['insufficient_history', 'not_in_open_pipeline']).nullable(),
  })
  .superRefine((p, ctx) => {
    const named = p.axes
      .filter(axis => !axis.evaluable)
      .map(axis => axis.key)
      .sort()
    if (named.join() !== [...p.unevaluable_axes].sort().join()) {
      ctx.addIssue({ code: 'custom', message: 'un axe non évaluable doit être nommé', path: ['unevaluable_axes'] })
    }
    if (p.value === null) {
      if (p.interval !== null) ctx.addIssue({ code: 'custom', message: 'intervalle sans chiffre', path: ['interval'] })
      if (p.not_measured_reason === null) {
        ctx.addIssue({ code: 'custom', message: '« non mesuré » se nomme', path: ['not_measured_reason'] })
      }
      return
    }
    if (p.interval === null) {
      ctx.addIssue({ code: 'custom', message: 'une probabilité porte son intervalle', path: ['interval'] })
    } else if (p.interval.low > p.value || p.interval.high < p.value) {
      ctx.addIssue({ code: 'custom', message: 'le chiffre sort de son intervalle', path: ['interval'] })
    }
    const grounded = p.axes.some(axis => axis.key !== 'stage' && axis.evaluable)
    if (!grounded) {
      ctx.addIssue({ code: 'custom', message: 'aucune issue réelle ne fonde le chiffre', path: ['axes'] })
    }
    if (p.not_measured_reason !== null) {
      ctx.addIssue({ code: 'custom', message: 'mesuré et non mesuré à la fois', path: ['not_measured_reason'] })
    }
  })
export type CalibratedProbability = z.infer<typeof calibratedProbabilitySchema>

type DealOutcome = { outcome: 'won' | 'lost'; highestStage: ProjectStage | null }

type SharedCases = {
  won: number
  lost: number
  contributingWorkspaces: number
  dimension: 'sector' | 'size' | 'group_role'
}

const stageIndex = (stage: ProjectStage): number => PROJECT_STAGES.indexOf(stage)
const FIRST_OPEN_STAGE = OPEN_PIPELINE_STAGES[0] as ProjectStage

/** Une affaire close a-t-elle ATTEINT ce stade ? Voir l'en-tête du module. */
function reached(outcome: DealOutcome, stage: ProjectStage): boolean {
  if (outcome.outcome === 'won') return true
  const highest = outcome.highestStage ?? FIRST_OPEN_STAGE
  return stageIndex(highest) >= stageIndex(stage)
}

export function calibrateDealProbability(input: {
  stage: ProjectStage
  history: readonly DealOutcome[]
  shared: SharedCases | null
  minObservations?: number
}): CalibratedProbability {
  const open = (OPEN_PIPELINE_STAGES as readonly ProjectStage[]).includes(input.stage)
  const stageAxis: ProbabilityAxis = {
    key: 'stage',
    evaluable: open,
    reason: open ? input.stage : 'not_in_open_pipeline',
    won: null,
    lost: null,
    weight: null,
  }
  const relevant = open ? input.history.filter(outcome => reached(outcome, input.stage)) : []
  const localWon = relevant.filter(outcome => outcome.outcome === 'won').length
  const localLost = relevant.length - localWon
  const historyAxis: ProbabilityAxis =
    relevant.length > 0
      ? {
          key: 'workspace_history',
          evaluable: true,
          reason: 'decided_deals',
          won: localWon,
          lost: localLost,
          weight: null,
        }
      : {
          key: 'workspace_history',
          evaluable: false,
          reason: 'no_decided_deal_at_stage',
          won: null,
          lost: null,
          weight: null,
        }

  const sharedTotal = input.shared ? input.shared.won + input.shared.lost : 0
  const sharedUsable =
    open &&
    input.shared !== null &&
    input.shared.contributingWorkspaces >= SHARED_BASE_MIN_WORKSPACES &&
    sharedTotal > 0
  const weight = sharedUsable ? Math.min(1, SHARED_PRIOR_MAX_OBSERVATIONS / sharedTotal) : 0
  const sharedAxis: ProbabilityAxis =
    sharedUsable && input.shared
      ? {
          key: 'shared_base',
          evaluable: true,
          reason: input.shared.dimension,
          won: input.shared.won,
          lost: input.shared.lost,
          weight,
        }
      : { key: 'shared_base', evaluable: false, reason: 'not_enough_shared_data', won: null, lost: null, weight: null }

  const axes = [stageAxis, historyAxis, sharedAxis]
  const unevaluable_axes = axes.filter(axis => !axis.evaluable).map(axis => axis.key)
  const sharedWon = sharedUsable && input.shared ? input.shared.won * weight : 0
  const sharedLost = sharedUsable && input.shared ? input.shared.lost * weight : 0
  const observations = relevant.length + sharedWon + sharedLost
  const base = { method: DEAL_PROBABILITY_METHOD, observations, axes, unevaluable_axes }

  if (!open) return { ...base, value: null, interval: null, not_measured_reason: 'not_in_open_pipeline' }
  if (observations < (input.minObservations ?? DEFAULT_MIN_OBSERVATIONS)) {
    return { ...base, value: null, interval: null, not_measured_reason: 'insufficient_history' }
  }
  const a = 1 + localWon + sharedWon
  const b = 1 + localLost + sharedLost
  const tail = (1 - INTERVAL_LEVEL) / 2
  return {
    ...base,
    value: a / (a + b),
    interval: { level: INTERVAL_LEVEL, low: betaQuantile(tail, a, b), high: betaQuantile(1 - tail, a, b) },
    not_measured_reason: null,
  }
}

// ── La mesure du calibrage a posteriori (#4016.1c) ────────────────────────────

/** Sous cinq affaires évaluables, le calibrage n'est pas mesuré — `null`, jamais 0. */
const BACKTEST_MIN_EVALUATED = 5

/** Cinq cases de fiabilité de largeur 0,2. */
const BACKTEST_BINS = 5

const calibrationBinSchema = z.object({
  from: z.number().min(0).max(1),
  to: z.number().min(0).max(1),
  count: z.number().int().nonnegative(),
  /** `null` = case vide, jamais « 0 % ». */
  mean_predicted: z.number().min(0).max(1).nullable(),
  observed_rate: z.number().min(0).max(1).nullable(),
})

/**
 * LE CALIBRAGE MESURÉ — #4016.1c. La probabilité n'est jamais persistée (GA-64) :
 * on ne peut donc pas comparer « ce qu'on a affiché » à l'issue. On mesure à la
 * place ce que la MÊME méthode aurait dit de chaque affaire close si on l'avait
 * laissée de côté (rétro-test « leave-one-out », sans base commune : elle inclut
 * l'espace, c92). L'écart de Brier est la moyenne de (p − issue)² ; la référence
 * est celle d'un calcul qui prédirait toujours le taux de base — un écart qui ne
 * la bat pas ne vaut rien et se lit comme tel.
 */
export const BACKTEST_METHOD = 'leave_one_out_v1' as const

export const calibrationBacktestSchema = z
  .object({
    method: z.literal(BACKTEST_METHOD),
    /** Affaires closes dont la probabilité était mesurable une fois laissées de côté. */
    evaluated: z.number().int().nonnegative(),
    brier: z.number().min(0).max(1).nullable(),
    baseline_brier: z.number().min(0).max(1).nullable(),
    bins: z.array(calibrationBinSchema),
    not_measured_reason: z.literal('insufficient_history').nullable(),
  })
  .superRefine((b, ctx) => {
    if (b.brier === null) {
      if (b.not_measured_reason === null) {
        ctx.addIssue({ code: 'custom', message: '« non mesuré » se nomme', path: ['not_measured_reason'] })
      }
      return
    }
    if (b.baseline_brier === null) {
      ctx.addIssue({ code: 'custom', message: 'un écart de Brier porte sa référence', path: ['baseline_brier'] })
    }
    if (b.not_measured_reason !== null) {
      ctx.addIssue({ code: 'custom', message: 'mesuré et non mesuré à la fois', path: ['not_measured_reason'] })
    }
  })
export type CalibrationBacktest = z.infer<typeof calibrationBacktestSchema>

export function backtestDealProbability(history: readonly DealOutcome[]): CalibrationBacktest {
  const scored: { predicted: number; actual: 0 | 1 }[] = []
  history.forEach((deal, index) => {
    const others = history.filter((_, i) => i !== index)
    const prediction = calibrateDealProbability({
      stage: deal.highestStage ?? FIRST_OPEN_STAGE,
      history: others,
      shared: null,
    })
    if (prediction.value !== null) scored.push({ predicted: prediction.value, actual: deal.outcome === 'won' ? 1 : 0 })
  })
  if (scored.length < BACKTEST_MIN_EVALUATED) {
    return {
      method: BACKTEST_METHOD,
      evaluated: scored.length,
      brier: null,
      baseline_brier: null,
      bins: [],
      not_measured_reason: 'insufficient_history',
    }
  }
  const mean = (values: readonly number[]): number => values.reduce((a, b) => a + b, 0) / values.length
  const brier = mean(scored.map(({ predicted, actual }) => (predicted - actual) ** 2))
  const rate = mean(scored.map(({ actual }) => actual))
  const bins = Array.from({ length: BACKTEST_BINS }, (_, i) => {
    const from = i / BACKTEST_BINS
    const to = (i + 1) / BACKTEST_BINS
    const inBin = scored.filter(({ predicted }) =>
      i === BACKTEST_BINS - 1 ? predicted >= from : predicted >= from && predicted < to,
    )
    return {
      from,
      to,
      count: inBin.length,
      mean_predicted: inBin.length > 0 ? mean(inBin.map(({ predicted }) => predicted)) : null,
      observed_rate: inBin.length > 0 ? mean(inBin.map(({ actual }) => actual)) : null,
    }
  })
  return {
    method: BACKTEST_METHOD,
    evaluated: scored.length,
    brier,
    baseline_brier: rate * (1 - rate),
    bins,
    not_measured_reason: null,
  }
}

// ── La loi Beta — fonction bêta incomplète régularisée et son inverse ──────────

function logGamma(x: number): number {
  // Lanczos (g = 7, n = 9).
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ]
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x)
  const z = x - 1
  let sum = c[0] as number
  for (let i = 1; i < 9; i++) sum += (c[i] as number) / (z + i)
  const t = z + 7.5
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(sum)
}

/** Fraction continue de Lentz pour I_x(a, b). */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const tiny = 1e-30
  let c = 1
  let d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < tiny) d = tiny
  d = 1 / d
  let h = d
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    h *= d * c
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
    d = 1 + aa * d
    if (Math.abs(d) < tiny) d = tiny
    c = 1 + aa / c
    if (Math.abs(c) < tiny) c = tiny
    d = 1 / d
    const delta = d * c
    h *= delta
    if (Math.abs(delta - 1) < 1e-12) break
  }
  return h
}

function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x))
  return x < (a + 1) / (a + b + 2)
    ? (front * betaContinuedFraction(x, a, b)) / a
    : 1 - (front * betaContinuedFraction(1 - x, b, a)) / b
}

/** Quantile par dichotomie — 60 pas suffisent à 1e-15. */
function betaQuantile(p: number, a: number, b: number): number {
  let low = 0
  let high = 1
  for (let i = 0; i < 60; i++) {
    const mid = (low + high) / 2
    if (regularizedBeta(mid, a, b) < p) low = mid
    else high = mid
  }
  return (low + high) / 2
}

// ── Le CA probable du trimestre ───────────────────────────────────────────────

const probableRevenueTotalSchema = z.object({
  currency: z.string(),
  expected_cents: z.number().int(),
  low_cents: z.number().int(),
  high_cents: z.number().int(),
  deals: z.number().int().positive(),
})

const probableRevenueSchema = z.object({
  /** `null` = rien de chiffrable. Jamais `[]` qu'un écran lirait « 0 ». */
  totals: z.array(probableRevenueTotalSchema).nullable(),
  without_amount: z.number().int().nonnegative(),
  without_probability: z.number().int().nonnegative(),
})
type ProbableRevenue = z.infer<typeof probableRevenueSchema>

/**
 * Montant × probabilité, par devise — deux devises ne s'additionnent jamais.
 * L'intervalle somme les bornes (hypothèse prudente : les affaires bougent
 * ensemble). Une affaire sans montant, ou sans probabilité mesurée, est
 * COMPTÉE à part, jamais lue « 0 ».
 */
export function probableQuarterRevenue(
  deals: readonly { amountCents: number | null; currency: string | null; probability: CalibratedProbability }[],
): ProbableRevenue {
  const byCurrency = new Map<string, z.infer<typeof probableRevenueTotalSchema>>()
  let withoutAmount = 0
  let withoutProbability = 0
  for (const deal of deals) {
    const { value, interval } = deal.probability
    if (value === null || interval === null) {
      withoutProbability += 1
      continue
    }
    if (deal.amountCents === null) {
      withoutAmount += 1
      continue
    }
    const currency = deal.currency ?? 'EUR'
    const total = byCurrency.get(currency) ?? { currency, expected_cents: 0, low_cents: 0, high_cents: 0, deals: 0 }
    total.expected_cents += deal.amountCents * value
    total.low_cents += deal.amountCents * interval.low
    total.high_cents += deal.amountCents * interval.high
    total.deals += 1
    byCurrency.set(currency, total)
  }
  const totals = [...byCurrency.values()].map(total => ({
    ...total,
    expected_cents: Math.round(total.expected_cents),
    low_cents: Math.round(total.low_cents),
    high_cents: Math.round(total.high_cents),
  }))
  return {
    totals: totals.length > 0 ? totals : null,
    without_amount: withoutAmount,
    without_probability: withoutProbability,
  }
}

/**
 * Le trimestre GLISSANT — les trois mois à venir, `[aujourd'hui, +3 mois)` en
 * dates ISO. Tranché sans Louis (11/10/2026) : un trimestre civil se vide de
 * lui-même les derniers jours de mars, juin, septembre et décembre, et le
 * chiffre sauterait d'un jour à l'autre sans qu'aucune affaire ne bouge.
 */
export function quarterWindow(now: Date): { from: string; until: string } {
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const until = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 3, now.getUTCDate()))
  return { from: from.toISOString().slice(0, 10), until: until.toISOString().slice(0, 10) }
}

/** La réponse de `GET /projects/probable-quarter`. */
export const probableQuarterSchema = z.object({
  method: z.literal(DEAL_PROBABILITY_METHOD),
  quarter: z.object({ from: z.string(), until: z.string() }),
  revenue: probableRevenueSchema,
  /** #4016.1c — le calibrage mesuré a posteriori (rétro-test), jamais une promesse. */
  calibration: calibrationBacktestSchema,
  deals: z.array(
    z.object({
      opportunity_id: z.string(),
      label: z.string(),
      stage: z.enum(PROJECT_STAGES),
      amount_cents: z.number().int().nullable(),
      currency: z.string().nullable(),
      expected_close_on: z.string().nullable(),
      // GA-64 (réécrite le 11/10/2026) : ce NOM de probabilité n'est permis
      // QUE parce que sa valeur est l'enveloppe calibrée.
      closing_probability: calibratedProbabilitySchema,
    }),
  ),
})
export type ProbableQuarter = z.infer<typeof probableQuarterSchema>
