import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { AnalyticsOverviewService } from './analytics-overview.service'
import { ProviderCostService } from './provider-cost.service'
import {
  COHORT_DAY_MARKS,
  COHORT_WINDOW_DAYS,
  computeConsultantsRegisteredByRep,
  computeValidatedActionCadence,
  measureActiveCohortAtDay7,
  measureActiveCohortAtDay30,
  measureBellumGrossMargin,
  measureRetentionAtThreeMonths,
  type BellumGrossMarginResult,
  type CohortMember,
  type ConsultantsRegisteredByRep,
  type ManagerKpiRateMeasure,
  type WeeklyValidatedActions,
} from './manager-kpi'

/** Fenêtre par défaut pour la marge et le compte de consultants, mêmes ordres
 *  de grandeur que le reste du fichier (`analytics-overview.service.ts`). */
const DEFAULT_WINDOW_DAYS = 30

/** Borne de lecture — comme partout ailleurs dans ce dossier, une requête
 *  d'analytics ne doit jamais devenir elle-même un coût. */
const MAX_ROWS = 20_000

/**
 * Câble les CINQ formules de `manager-kpi.ts` sur les vraies tables — sans
 * recalculer ce qui existe déjà : le revenu et les comptes payants viennent de
 * {@link AnalyticsOverviewService.getOverview}, le coût fournisseurs de
 * {@link ProviderCostService.overview}. Un seul repository injecté
 * (`ProfileEntity`) suffit pour le reste : comme `AnalyticsOverviewService`,
 * toutes les requêtes passent par `manager.query` en SQL brut — ce service n'a
 * la propriété d'AUCUNE des tables qu'il lit (`profiles`, `user_actions`,
 * `approval_requests`, `consultants`), il les lit toutes en LECTURE SEULE,
 * comme le fait déjà `AnalyticsOverviewService` pour `credit_ledger` /
 * `subscriptions`.
 */
@Injectable()
export class ManagerKpiService {
  constructor(
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    private readonly overview: AnalyticsOverviewService,
    private readonly providerCosts: ProviderCostService,
  ) {}

  private query<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    return this.profiles.manager.query(sql, params) as Promise<T[]>
  }

  /** Les inscriptions + la dernière action tracée, sur une fenêtre large qui
   *  contient la cohorte exacte (`manager-kpi.ts` fait le tri précis — cette
   *  requête ne fait que rétrécir le volume lu). */
  private async cohortMembers(now: Date, dayMark: number, cohortWindowDays: number): Promise<CohortMember[]> {
    const cohortEnd = new Date(now.getTime() - dayMark * 86_400_000)
    const cohortStart = new Date(cohortEnd.getTime() - cohortWindowDays * 86_400_000)
    const rows = await this.query<{ user_id: string; signup_at: string; last_action_at: string | null }>(
      `-- q:cohort_members
       SELECT p.user_id::text AS user_id, p.created_at AS signup_at, MAX(ua.created_at) AS last_action_at
       FROM profiles p
       LEFT JOIN user_actions ua ON ua.user_id = p.user_id
       WHERE p.created_at > $1 AND p.created_at <= $2
       GROUP BY p.user_id, p.created_at
       LIMIT ${MAX_ROWS}`,
      [cohortStart, cohortEnd],
    )
    return rows.map(row => ({
      userId: row.user_id,
      signupAt: new Date(row.signup_at),
      lastActionAt: row.last_action_at ? new Date(row.last_action_at) : null,
    }))
  }

  /**
   * #1946.14 · Usage à J+7 — voir `manager-kpi.ts` pour la formule et pour la
   * raison de sa fenêtre d'activité plus courte.
   */
  async activeCohortAtDay7(now: Date = new Date()): Promise<ManagerKpiRateMeasure> {
    const members = await this.cohortMembers(now, COHORT_DAY_MARKS.firstWeek, COHORT_WINDOW_DAYS.firstWeek)
    return measureActiveCohortAtDay7(members, now)
  }

  /** 1 · Cohorte des actifs à J+30 — voir `manager-kpi.ts` pour la formule. */
  async activeCohortAtDay30(now: Date = new Date()): Promise<ManagerKpiRateMeasure> {
    const members = await this.cohortMembers(now, COHORT_DAY_MARKS.activeCohort, COHORT_WINDOW_DAYS.activeCohort)
    return measureActiveCohortAtDay30(members, now)
  }

  /** 2 · Rétention à 3 mois — voir `manager-kpi.ts` pour la formule. */
  async retentionAtThreeMonths(now: Date = new Date()): Promise<ManagerKpiRateMeasure> {
    const members = await this.cohortMembers(now, COHORT_DAY_MARKS.retention, COHORT_WINDOW_DAYS.retention)
    return measureRetentionAtThreeMonths(members, now)
  }

  /**
   * 3 · Marge brute de BELLUM. Revenu ET comptes payants viennent de
   * `AnalyticsOverviewService.getOverview` (l'estimation MRR déjà rendue,
   * importée, jamais recalculée) ; le coût fournisseurs de
   * `ProviderCostService.overview`, sur la MÊME fenêtre. Les deux sont dans des
   * devises différentes (EUR pour le revenu, USD pour le coût) — voir
   * `measureBellumGrossMargin` pour pourquoi ce fichier REFUSE de les
   * mélanger, ce qui fait qu'AUJOURD'HUI cette méthode rend systématiquement
   * `blockedReason: 'currency_mismatch'`. Ce n'est pas une panne de ce
   * service : c'est le trou de données qu'il rend visible plutôt que de le
   * masquer par un taux de change inventé.
   */
  async bellumGrossMargin(days: number = DEFAULT_WINDOW_DAYS): Promise<BellumGrossMarginResult> {
    const [overview, costs] = await Promise.all([this.overview.getOverview(days), this.providerCosts.overview(days)])
    return measureBellumGrossMargin({
      revenue: { currency: 'eur', cents: Math.round((overview.revenue.estimatedMrrEur ?? 0) * 100) },
      variableCost: { currency: 'usd', cents: Math.round(costs.total.cost_usd * 100) },
      untariffedCostLines: costs.total.untariffed,
      paidAccounts: overview.revenue.paidAccounts,
    })
  }

  /** 4 · Cadence d'actions validées par semaine. */
  async validatedActionCadence(weeks: number = 8, now: Date = new Date()): Promise<readonly WeeklyValidatedActions[]> {
    // Une semaine de marge en plus : la borne exacte est retranchée par
    // `computeValidatedActionCadence`, cette requête ne fait que rétrécir le
    // volume lu.
    const since = new Date(now.getTime() - (weeks + 1) * 7 * 86_400_000)
    const rows = await this.query<{ state: string; decided_at: string | null }>(
      `-- q:validated_actions
       SELECT state, decided_at
       FROM approval_requests
       WHERE state = 'approved' AND decided_at >= $1
       LIMIT ${MAX_ROWS}`,
      [since],
    )
    return computeValidatedActionCadence(
      rows.map(row => ({
        state: row.state as 'approved',
        decidedAt: row.decided_at ? new Date(row.decided_at) : null,
      })),
      now,
      weeks,
    )
  }

  /** 5 · Consultants enregistrés par commercial. */
  async consultantsRegisteredByRep(
    windowDays: number = DEFAULT_WINDOW_DAYS,
    now: Date = new Date(),
  ): Promise<readonly ConsultantsRegisteredByRep[]> {
    const from = new Date(now.getTime() - windowDays * 86_400_000)
    const rows = await this.query<{ user_id: string; created_at: string }>(
      `-- q:consultants_by_rep
       SELECT user_id::text AS user_id, created_at
       FROM consultants
       WHERE created_at >= $1 AND created_at < $2
       LIMIT ${MAX_ROWS}`,
      [from, now],
    )
    return computeConsultantsRegisteredByRep(
      rows.map(row => ({ userId: row.user_id, createdAt: new Date(row.created_at) })),
      { from, to: now },
    )
  }
}
