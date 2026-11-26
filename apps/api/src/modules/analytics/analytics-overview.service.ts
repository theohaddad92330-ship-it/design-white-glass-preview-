import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { MIN_DISTINCT_SESSIONS_FOR_A_METRIC } from '@bellum/contracts'
import { ProductEventEntity } from '../../database/entities/product-event.entity'
import { PLAN_CATALOG_DEFAULTS, PLAN_KEYS } from '../credits/plan-catalog.defaults'
import { PlanCatalogService } from '../credits/plan-catalog.service'
import { withheldBelowThreshold, type WithheldMetric } from './product-analytics-read.service'

/** Static price grid (cents) from the shipped catalog defaults — the fallback for
 *  the pure estimators when no live grid is supplied (keeps them testable and
 *  byte-identical to the former `PLAN_CONFIG`-backed behaviour). */
const DEFAULT_PRICE_GRID_CENTS: Record<string, number> = Object.fromEntries(
  PLAN_KEYS.map(key => [key, PLAN_CATALOG_DEFAULTS[key].price]),
)

/** Shipped per-seat add-on prices (cents), keyed by plan. */
const DEFAULT_SEAT_PRICE_GRID_CENTS: Record<string, number> = Object.fromEntries(
  PLAN_KEYS.map(key => [key, PLAN_CATALOG_DEFAULTS[key].extra_seat_price]),
)

/**
 * Day-1 metrics overview, derived from `product_events` + the billing tables.
 * Everything here is either directly measured or explicitly marked as not-yet-
 * derivable (see `notes`) — we never fabricate a figure. Read-only, operator-
 * facing (behind the internal-secret guard).
 */
export type AnalyticsOverview = {
  windowDays: number
  generatedAt: string
  activation: {
    onboardingStarted: number
    onboardingCompleted: number
    // Users who completed onboarding AND later launched at least one analysis.
    activatedUsers: number
    // activatedUsers / onboardingCompleted — `null` when nobody completed
    // onboarding, AND when the denominator is below the publication threshold
    // (#1681.1). `withheld` below says WHICH of the two it is: `null` alone
    // would leave the reader to guess, and "0 %" would be a lie twice over.
    activationRate: number | null
    /**
     * #2085.14 — LA MÊME QUESTION, mais datée par la cohorte d'inscription :
     * `activationRate` ci-dessus est une part sur TOUTE la fenêtre de lecture,
     * `byCohort` compare des utilisateurs qui ont eu EXACTEMENT le même temps
     * pour activer (J+1 / J+7 / J+30 après `onboarding_completed`). Un des deux
     * horizons peut être `below_threshold` pendant que l'autre est `measured` —
     * ce ne sont pas des cumuls, une cohorte J+30 mûre n'implique pas que sa
     * J+7 le soit dans la même fenêtre de lecture.
     */
    byCohort: ActivationCohort[]
  }
  analyses: {
    started: number
    completed: number
    workspacesWithAnalysis: number
    avgPerWorkspace: number | null
    // From `analysis_runs.cost_eur` (authoritative accumulated LLM cost, USD).
    avgCostEur: number | null
    totalCostEur: number | null
  }
  credits: {
    // From `credit_ledger` consume rows (signed deltas → positive consumption).
    analysisConsumed: number
    enrichmentConsumed: number
    topups: number
  }
  engagement: {
    contactsEnriched: number
    messagesSent: number
    exportsPerformed: number
  }
  revenue: {
    planDistribution: Record<string, number>
    paidAccounts: number
    trialAccounts: number
    // Derived from current subscriptions × PLAN_CONFIG price grid (+ seat add-on).
    // A point-in-time estimate, NOT invoiced revenue (ignores proration/discounts).
    estimatedMrrEur: number | null
    arpaEur: number | null
    // paid / (paid + trial), a SNAPSHOT proxy — see notes for why it isn't a
    // true signup→paid cohort conversion rate.
    conversionSnapshotRate: number | null
  }
  churnRisk: {
    thresholdDays: number
    // Onboarded users with no analysis_started in the last `thresholdDays`.
    atRiskUsers: number
    sample: Array<{ userId: string; lastAnalysisAt: string | null }>
  }
  /**
   * #1681.1 — les mesures RETENUES faute d'effectif, chacune NOMMÉE avec le
   * nombre de sujets observés et le seuil. Vide = rien n'a été retenu.
   *
   * ⚠️ Un champ AJOUTÉ, jamais un champ dont la forme change : le back-office
   * lit déjà `activationRate: number | null`, et le faire basculer en union
   * casserait un écran qu'aucun test de ce dépôt ne monte.
   */
  withheld: WithheldMetric[]
  // Metrics that need more history than we currently retain — surfaced honestly
  // rather than guessed. Populated in `getOverview`.
  notes: string[]
}

const DEFAULT_WINDOW_DAYS = 30
const MAX_WINDOW_DAYS = 365
const DEFAULT_CHURN_THRESHOLD_DAYS = 14
const CHURN_SAMPLE_LIMIT = 50

/** A finite number or null (Postgres `numeric`/aggregate results arrive as strings). */
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/** A finite number or 0 — for counts that must never be null. */
function count(value: unknown): number {
  return num(value) ?? 0
}

/** Cents → euros, 2 dp, or null when the input is null. */
function centsToEur(cents: number | null): number | null {
  return cents === null ? null : Math.round(cents) / 100
}

/** activatedUsers / onboardingCompleted, or null when nobody completed. */
export function computeActivationRate(activated: number, completed: number): number | null {
  return completed > 0 ? round2(activated / completed) : null
}

/**
 * #2085.14 — les trois horizons DATÉS PAR L'INSCRIPTION (`onboarding_completed`),
 * jamais par la fenêtre de lecture : « activation J+7 » compare des cohortes
 * signées il y a AU MOINS 7 jours, pas une part flottante de la fenêtre entière.
 */
export const ACTIVATION_COHORT_HORIZONS_DAYS = [1, 7, 30] as const

/** Une cohorte d'activation à un horizon donné. */
// Pas d'`export` : ce type n'est consommé que dans ce fichier (`byCohort`
// ligne ~50, le retour de `computeActivationCohort`). L'exporter le ferait
// tomber sous `lint:exports:types` (knip) — règle du dépôt : ne jamais
// exporter un type uniquement consommé chez lui. `computeActivationCohort`,
// elle, reste exportée : sa spec l'appelle.
interface ActivationCohort {
  horizonDays: number
  /** Utilisateurs dont l'inscription a eu le temps matériel d'atteindre cet
   *  horizon — le dénominateur. */
  eligibleUsers: number
  activatedUsers: number
  /**
   * `not_yet_mature` : aucun utilisateur de la fenêtre n'a encore atteint cet
   * horizon — un vrai zéro serait faux, ce n'est pas « personne n'active »,
   * c'est « personne n'a eu le temps ». `below_threshold` : le dénominateur
   * existe mais est trop petit pour être publié (règle 1, `c64_analytique_produit`
   * — un taux sur trois personnes en désigne une). `measured` : un taux réel.
   */
  state: 'measured' | 'not_yet_mature' | 'below_threshold'
  /** `null` sauf `state: 'measured'` — jamais 0 pour dire « pas mesuré ». */
  rate: number | null
}

/** La part `activatedUsers / eligibleUsers` à un horizon, avec ses trois états. */
export function computeActivationCohort(
  horizonDays: number,
  eligibleUsers: number,
  activatedUsers: number,
): ActivationCohort {
  if (eligibleUsers === 0) return { horizonDays, eligibleUsers, activatedUsers, state: 'not_yet_mature', rate: null }
  if (eligibleUsers < MIN_DISTINCT_SESSIONS_FOR_A_METRIC) {
    return { horizonDays, eligibleUsers, activatedUsers, state: 'below_threshold', rate: null }
  }
  return { horizonDays, eligibleUsers, activatedUsers, state: 'measured', rate: round2(activatedUsers / eligibleUsers) }
}

/** paid / (paid + trial), or null when there are no accounts. */
export function computeConversionSnapshot(paid: number, trial: number): number | null {
  const total = paid + trial
  return total > 0 ? round2(paid / total) : null
}

/**
 * Estimated MRR (in cents) from a current plan distribution + the extra seats
 * purchased ON EACH PLAN, using the plan and per-seat price grids (in cents).
 * Both grids default to the shipped catalog defaults; the service passes the
 * LIVE grids from the DB-backed catalog so an operator's price edit reflects in
 * the estimate. Seats are priced per plan (not by a single constant) because the
 * add-on price is itself per-plan and editable. Unknown plan keys contribute 0.
 */
export function estimateMrrCents(
  planDistribution: Record<string, number>,
  extraSeatsByPlan: Record<string, number>,
  priceGrid: Record<string, number> = DEFAULT_PRICE_GRID_CENTS,
  seatPriceGrid: Record<string, number> = DEFAULT_SEAT_PRICE_GRID_CENTS,
): number {
  let cents = 0
  for (const [plan, n] of Object.entries(planDistribution)) {
    cents += (priceGrid[plan] ?? 0) * n
  }
  for (const [plan, seats] of Object.entries(extraSeatsByPlan)) {
    cents += Math.max(0, seats) * (seatPriceGrid[plan] ?? 0)
  }
  return cents
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** A plan is "paid" if its price is > 0 (trial / cancelled = 0). `priceGrid`
 *  defaults to the shipped catalog defaults; the caller passes the live grid. */
function isPaidPlan(plan: string, priceGrid: Record<string, number> = DEFAULT_PRICE_GRID_CENTS): boolean {
  return (priceGrid[plan] ?? 0) > 0
}

@Injectable()
export class AnalyticsOverviewService {
  private readonly logger = new Logger(AnalyticsOverviewService.name)

  constructor(
    // A single repo is enough: all rollups run as `manager.query` raw SQL, which
    // can read any table (credit_ledger / analysis_runs / subscriptions) — no
    // need to inject a repo per table. Keeps the module light.
    @InjectRepository(ProductEventEntity)
    private readonly events: Repository<ProductEventEntity>,
    // DB-backed plan catalog — supplies the LIVE price grid for the MRR estimate.
    // `@Optional()` so the direct-`new` spec (single repo arg) is unaffected; when
    // absent the pure estimators fall back to the shipped default grid.
    @Optional() private readonly planCatalog?: PlanCatalogService,
  ) {}

  private query<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    return this.events.manager.query(sql, params) as Promise<T[]>
  }

  async getOverview(
    windowDaysInput = DEFAULT_WINDOW_DAYS,
    churnThresholdInput = DEFAULT_CHURN_THRESHOLD_DAYS,
  ): Promise<AnalyticsOverview> {
    const windowDays = clampInt(windowDaysInput, 1, MAX_WINDOW_DAYS, DEFAULT_WINDOW_DAYS)
    const churnThreshold = clampInt(churnThresholdInput, 1, MAX_WINDOW_DAYS, DEFAULT_CHURN_THRESHOLD_DAYS)

    const [eventCounts, activation, analysesByWs, cost, ledger, subs, churnSample, churnCount, cohortRows] =
      await Promise.all([
        this.eventCounts(windowDays),
        this.activatedUsers(windowDays),
        this.analysesByWorkspace(windowDays),
        this.analysisCost(windowDays),
        this.creditConsumption(windowDays),
        this.subscriptionSnapshot(),
        this.churnSample(churnThreshold),
        this.churnCount(churnThreshold),
        Promise.all(
          ACTIVATION_COHORT_HORIZONS_DAYS.map(horizonDays => this.activationCohortRow(horizonDays, windowDays)),
        ),
      ])

    const onboardingCompleted = eventCounts['onboarding_completed'] ?? 0
    const activatedUsers = activation
    const started = analysesByWs.started
    const workspaces = analysesByWs.workspaces

    const planDistribution = subs.distribution
    // Live price grid from the DB-backed catalog when wired; the pure helpers fall
    // back to the shipped defaults when it's absent (direct-`new` spec).
    const priceGrid = this.planCatalog ? await this.planCatalog.priceGridCents() : undefined
    const seatPriceGrid = this.planCatalog ? await this.planCatalog.seatPriceGridCents() : undefined
    const paidAccounts = Object.entries(planDistribution)
      .filter(([plan]) => isPaidPlan(plan, priceGrid))
      .reduce((s, [, n]) => s + n, 0)
    const trialAccounts = Object.entries(planDistribution)
      .filter(([plan]) => !isPaidPlan(plan, priceGrid))
      .reduce((s, [, n]) => s + n, 0)
    const mrrCents = estimateMrrCents(planDistribution, subs.extraSeatsByPlan, priceGrid, seatPriceGrid)
    const arpaCents = paidAccounts > 0 ? mrrCents / paidAccounts : null

    // #1681.1 — LE SEUIL, APPLIQUÉ. Le registre de doctrine
    // (`c64_analytique_produit`, règle 1) nommait ce fichier comme l'un des deux
    // qui « publient leurs agrégats quel que soit l'effectif ».
    //
    // ⚠️ POURQUOI CE TAUX-LÀ ET PAS LES TROIS AUTRES DE CE FICHIER. La règle
    // protège une PERSONNE : « sous ce seuil, une moyenne DÉSIGNE quelqu'un ».
    // Ce qui décide, c'est donc ce que compte le DÉNOMINATEUR.
    //  · `activationRate` — dénominateur : des UTILISATEURS distincts. Un taux
    //    d'activation sur trois personnes est une phrase sur une personne,
    //    écrite en pourcentage. RETENU sous le seuil.
    //  · `avgPerWorkspace` — dénominateur : des ESPACES. La doctrine désigne
    //    elle-même l'espace comme unité d'analyse légitime (c'est le grain de
    //    `retention-cohorts` et de l'entonnoir d'onboarding), et il a son propre
    //    seuil de masquage ailleurs (3 espaces, #1658/#1686). Non retenu ici.
    //  · `conversionSnapshotRate` / `arpaEur` — dénominateur : des COMPTES
    //    CLIENTS, c'est-à-dire des sociétés, et une mesure commerciale, pas un
    //    comportement. Non retenus.
    // Ce n'est pas une règle appliquée à moitié : c'est la règle appliquée à ce
    // qu'elle vise.
    const activationWithheld = withheldBelowThreshold('activation.activationRate', onboardingCompleted)

    // #2085.14 — même raison que `activationWithheld` juste au-dessus : le
    // dénominateur de CHAQUE horizon est un compte d'UTILISATEURS distincts.
    const byCohort = cohortRows.map(row => computeActivationCohort(row.horizonDays, row.eligible, row.activated))
    const cohortWithheld = byCohort
      .filter(cohort => cohort.state === 'below_threshold')
      .map(cohort => withheldBelowThreshold(`activation.byCohort.d${cohort.horizonDays}`, cohort.eligibleUsers))
      .filter((entry): entry is WithheldMetric => entry !== null)

    return {
      windowDays,
      generatedAt: new Date().toISOString(),
      activation: {
        onboardingStarted: eventCounts['onboarding_started'] ?? 0,
        onboardingCompleted,
        activatedUsers,
        // ⚠️ L'ordre compte : le seuil passe AVANT le calcul. Une mesure qu'on
        // n'a pas le droit de publier ne doit pas exister, même une
        // microseconde, dans une variable qu'on pourrait journaliser ensuite —
        // même raison qu'à `chatbot-funnel-stages.ts`.
        activationRate: activationWithheld ? null : computeActivationRate(activatedUsers, onboardingCompleted),
        byCohort,
      },
      analyses: {
        started,
        completed: eventCounts['analysis_completed'] ?? 0,
        workspacesWithAnalysis: workspaces,
        avgPerWorkspace: workspaces > 0 ? round2(started / workspaces) : null,
        avgCostEur: cost.avgCostEur,
        totalCostEur: cost.totalCostEur,
      },
      credits: {
        analysisConsumed: ledger.analysisConsumed,
        enrichmentConsumed: ledger.enrichmentConsumed,
        topups: eventCounts['credits_topup'] ?? 0,
      },
      engagement: {
        contactsEnriched: eventCounts['contact_enriched'] ?? 0,
        messagesSent: eventCounts['message_sent'] ?? 0,
        exportsPerformed: eventCounts['export_performed'] ?? 0,
      },
      revenue: {
        planDistribution,
        paidAccounts,
        trialAccounts,
        estimatedMrrEur: centsToEur(mrrCents),
        arpaEur: centsToEur(arpaCents),
        conversionSnapshotRate: computeConversionSnapshot(paidAccounts, trialAccounts),
      },
      churnRisk: {
        thresholdDays: churnThreshold,
        atRiskUsers: churnCount,
        sample: churnSample,
      },
      withheld: [...(activationWithheld ? [activationWithheld] : []), ...cohortWithheld],
      notes: [
        'MRR/ARPA are point-in-time estimates from current subscriptions × the PLAN_CONFIG price grid — not invoiced revenue (ignores proration, discounts, mid-cycle changes).',
        'conversionSnapshotRate is a current paid-vs-trial ratio, NOT a signup→paid cohort conversion. A true funnel needs per-user signup + upgrade timestamps we do not yet retain (subscriptions keeps only current state).',
        'True churn rate needs historical subscription state transitions (active→cancelled over time). We only store current state, so we surface a churn-risk proxy (onboarded but inactive) instead.',
        'Time-gained-perceived requires a user-reported signal (survey/feedback) — no such event is emitted yet; not derivable.',
        'activationRate is WITHHELD (null, and listed in `withheld`) when fewer than the doctrine minimum of distinct users completed onboarding in the window — below that count an average names a person (c64_analytique_produit, rule 1). Withheld is never 0: `withheld[].subjects` says how many were observed.',
        '#2085.14 — byCohort dates activation by SIGNUP (onboarding_completed), not by the read window: a J+7 horizon only counts users who completed onboarding at least 7 days ago, inside a rolling window of `windowDays` width offset by the horizon (so every eligible user has had the FULL horizon to activate). `not_yet_mature` (zero eligible users) is never confused with a real zero, and `below_threshold` follows the same doctrine minimum as activationRate.',
      ],
    }
  }

  /** `-- q:events` — event counts by name within the window. */
  private async eventCounts(windowDays: number): Promise<Record<string, number>> {
    const rows = await this.query<{ event_name: string; count: number | string }>(
      `-- q:events
       SELECT event_name, COUNT(*)::int AS count
       FROM product_events
       WHERE occurred_at >= now() - make_interval(days => $1)
       GROUP BY event_name`,
      [windowDays],
    )
    const out: Record<string, number> = {}
    for (const r of rows) out[r.event_name] = count(r.count)
    return out
  }

  /** `-- q:activation` — users who completed onboarding in-window AND ran an
   *  analysis on/after that completion. */
  private async activatedUsers(windowDays: number): Promise<number> {
    const rows = await this.query<{ activated: number | string }>(
      `-- q:activation
       SELECT COUNT(DISTINCT c.user_id)::int AS activated
       FROM product_events c
       JOIN product_events a
         ON a.user_id = c.user_id
        AND a.event_name = 'analysis_started'
        AND a.occurred_at >= c.occurred_at
       WHERE c.event_name = 'onboarding_completed'
         AND c.occurred_at >= now() - make_interval(days => $1)`,
      [windowDays],
    )
    return count(rows[0]?.activated)
  }

  /**
   * `-- q:cohort_activation` — #2085.14. Un horizon (J+1/J+7/J+30) : le
   * dénominateur (`eligible`) est borné à ceux qui ont complété l'onboarding
   * il y a AU MOINS `horizonDays` jours (mature pour CET horizon), dans une
   * fenêtre glissante de `windowDays` largeur, décalée de `horizonDays` dans
   * le passé — sans ce décalage, un `windowDays` par défaut de 30 rendrait la
   * cohorte J+30 quasi vide (elle exigerait un utilisateur inscrit il y a
   * PILE 30 jours). `activated` compte ceux qui ont lancé une analyse DANS ce
   * même horizon depuis leur inscription — jamais après.
   */
  private async activationCohortRow(
    horizonDays: number,
    windowDays: number,
  ): Promise<{ horizonDays: number; eligible: number; activated: number }> {
    const rows = await this.query<{ eligible: number | string; activated: number | string }>(
      `-- q:cohort_activation
       SELECT
         COUNT(DISTINCT c.user_id)::int AS eligible,
         COUNT(DISTINCT a.user_id)::int AS activated
       FROM product_events c
       LEFT JOIN product_events a
         ON a.user_id = c.user_id
        AND a.event_name = 'analysis_started'
        AND a.occurred_at >= c.occurred_at
        AND a.occurred_at <= c.occurred_at + make_interval(days => $1)
       WHERE c.event_name = 'onboarding_completed'
         AND c.occurred_at <= now() - make_interval(days => $1)
         AND c.occurred_at >= now() - make_interval(days => $2)`,
      [horizonDays, windowDays + horizonDays],
    )
    return { horizonDays, eligible: count(rows[0]?.eligible), activated: count(rows[0]?.activated) }
  }

  /** `-- q:analyses_ws` — distinct workspaces + total analyses started in-window. */
  private async analysesByWorkspace(windowDays: number): Promise<{ workspaces: number; started: number }> {
    const rows = await this.query<{ workspaces: number | string; started: number | string }>(
      `-- q:analyses_ws
       SELECT COUNT(DISTINCT workspace_id)::int AS workspaces,
              COUNT(*)::int AS started
       FROM product_events
       WHERE event_name = 'analysis_started'
         AND workspace_id IS NOT NULL
         AND occurred_at >= now() - make_interval(days => $1)`,
      [windowDays],
    )
    return { workspaces: count(rows[0]?.workspaces), started: count(rows[0]?.started) }
  }

  /** `-- q:cost` — avg + total run cost from analysis_runs (authoritative). */
  private async analysisCost(windowDays: number): Promise<{ avgCostEur: number | null; totalCostEur: number | null }> {
    const rows = await this.query<{ avg_cost: number | string | null; total_cost: number | string | null }>(
      `-- q:cost
       SELECT AVG(cost_eur) AS avg_cost, SUM(cost_eur) AS total_cost
       FROM analysis_runs
       WHERE status = 'completed'
         AND cost_eur IS NOT NULL
         AND created_at >= now() - make_interval(days => $1)`,
      [windowDays],
    )
    const avg = num(rows[0]?.avg_cost)
    return {
      avgCostEur: avg === null ? null : round2(avg),
      totalCostEur: num(rows[0]?.total_cost),
    }
  }

  /** `-- q:ledger` — analysis/enrichment credits consumed in-window (deltas are
   *  negative on consume, so negate the sum to get a positive count). */
  private async creditConsumption(
    windowDays: number,
  ): Promise<{ analysisConsumed: number; enrichmentConsumed: number }> {
    const rows = await this.query<{ analysis_consumed: number | string; enrichment_consumed: number | string }>(
      `-- q:ledger
       SELECT
         COALESCE(-SUM(delta) FILTER (WHERE kind = 'consume_analysis'), 0)::int AS analysis_consumed,
         COALESCE(-SUM(delta) FILTER (WHERE kind = 'consume_enrichment'), 0)::int AS enrichment_consumed
       FROM credit_ledger
       WHERE created_at >= now() - make_interval(days => $1)`,
      [windowDays],
    )
    return {
      analysisConsumed: count(rows[0]?.analysis_consumed),
      enrichmentConsumed: count(rows[0]?.enrichment_consumed),
    }
  }

  /** `-- q:subs` — current plan distribution + purchased extra seats PER PLAN
   *  (the add-on is priced per plan, so the totals can't be collapsed). */
  private async subscriptionSnapshot(): Promise<{
    distribution: Record<string, number>
    extraSeatsByPlan: Record<string, number>
  }> {
    const rows = await this.query<{ plan: string; count: number | string; extra_seats: number | string }>(
      `-- q:subs
       SELECT plan, COUNT(*)::int AS count, COALESCE(SUM(extra_seats), 0)::int AS extra_seats
       FROM subscriptions
       GROUP BY plan`,
      [],
    )
    const distribution: Record<string, number> = {}
    const extraSeatsByPlan: Record<string, number> = {}
    for (const r of rows) {
      distribution[r.plan] = count(r.count)
      extraSeatsByPlan[r.plan] = count(r.extra_seats)
    }
    return { distribution, extraSeatsByPlan }
  }

  /** `-- q:churn_sample` — onboarded users inactive (no analysis) past the
   *  threshold. Churn-risk PROXY (documented), not ML. */
  private async churnSample(thresholdDays: number): Promise<Array<{ userId: string; lastAnalysisAt: string | null }>> {
    const rows = await this.query<{ user_id: string; last_analysis: Date | string | null }>(
      `-- q:churn_sample
       SELECT oc.user_id::text AS user_id, MAX(a.occurred_at) AS last_analysis
       FROM (SELECT DISTINCT user_id FROM product_events WHERE event_name = 'onboarding_completed') oc
       LEFT JOIN product_events a
         ON a.user_id = oc.user_id AND a.event_name = 'analysis_started'
       GROUP BY oc.user_id
       HAVING MAX(a.occurred_at) IS NULL
           OR MAX(a.occurred_at) < now() - make_interval(days => $1)
       ORDER BY last_analysis ASC NULLS FIRST
       LIMIT ${CHURN_SAMPLE_LIMIT}`,
      [thresholdDays],
    )
    return rows.map(r => ({
      userId: r.user_id,
      lastAnalysisAt: r.last_analysis ? new Date(r.last_analysis).toISOString() : null,
    }))
  }

  /** `-- q:churn_count` — total count behind {@link churnSample} (uncapped). */
  private async churnCount(thresholdDays: number): Promise<number> {
    const rows = await this.query<{ n: number | string }>(
      `-- q:churn_count
       SELECT COUNT(*)::int AS n FROM (
         SELECT oc.user_id
         FROM (SELECT DISTINCT user_id FROM product_events WHERE event_name = 'onboarding_completed') oc
         LEFT JOIN product_events a
           ON a.user_id = oc.user_id AND a.event_name = 'analysis_started'
         GROUP BY oc.user_id
         HAVING MAX(a.occurred_at) IS NULL
             OR MAX(a.occurred_at) < now() - make_interval(days => $1)
       ) t`,
      [thresholdDays],
    )
    return count(rows[0]?.n)
  }
}

/** Parse + clamp an integer input, falling back to `fallback` on garbage. */
function clampInt(value: number, min: number, max: number, fallback: number): number {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
