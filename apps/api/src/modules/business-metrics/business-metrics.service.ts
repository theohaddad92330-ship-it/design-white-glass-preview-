import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BusinessMetricSnapshotEntity } from '../../database/entities/business-metric-snapshot.entity'
import { BusinessMetricSnapshotLineEntity } from '../../database/entities/business-metric-snapshot-line.entity'
import { BusinessTreasuryMonthEntity } from '../../database/entities/business-treasury-month.entity'
import { ManualBillingTermsEntity } from '../../database/entities/manual-billing-terms.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { PLAN_GRIDS, type PlanGridsReader } from './module-tokens'
import {
  computeMovements,
  contractedMonthlyCents,
  lineMovements,
  monthOf,
  previousMonth,
  recurringLines,
  type LineMovementNature,
  type ManualBillingPeriod,
  type ManualTermRow,
  type MrrMovements,
  type SnapshotLine,
} from './mrr-movements'
import { averageBurnCents, burnOf, runwayMonths, type TreasuryMonth } from './treasury'

/** La position du MOMENT — ce qui serait figé si on prenait la photo maintenant. */
export interface BusinessPosition {
  lines: SnapshotLine[]
  mrrCents: number
  customers: number
  contractedRevenueCents: number
  contractedCustomers: number
  oneOffCents: number
  oneOffCustomers: number
}

/** Un mois de la série, tel qu'il est rendu à l'opérateur. */
export interface BusinessMonth extends MrrMovements {
  month: string
  contractedRevenueCents: number
  contractedCustomers: number
  oneOffCents: number
  oneOffCustomers: number
  computedAt: string
}

/** Le mois de trésorerie rendu avec ce qu'on en DÉRIVE. */
export interface TreasuryMonthView extends TreasuryMonth {
  burnCents: number | null
  updatedAt: string | null
  updatedBy: string | null
}

export interface TreasuryView {
  months: TreasuryMonthView[]
  /** Le mois le plus récent SAISI, ou `null` si rien ne l'est encore. */
  latestMonth: string | null
  averageBurn: ReturnType<typeof averageBurnCents> | null
  runway: ReturnType<typeof runwayMonths> | null
}

/**
 * Une ligne du tableau des mouvements du mois, prête pour l'écran (#1646.6).
 *
 * `client` est le nom de l'ESPACE dont le sujet facturé est propriétaire, ou à
 * défaut l'e-mail de son profil, ou `null` si ni l'un ni l'autre n'est
 * connu — jamais un identifiant technique brut à la place d'un nom, et jamais
 * une valeur inventée.
 */
export interface MonthlyClientMovement {
  client: string | null
  nature: LineMovementNature
  montantCents: number
  month: string
}

/** Ce qu'on accepte de la saisie. `null` efface une valeur ; `undefined` la laisse. */
export interface TreasuryInput {
  bankBalanceCents?: number | null
  fixedExpensesCents?: number | null
  variableExpensesCents?: number | null
  collectedCents?: number | null
}

/** Combien de mois la série rend par défaut — douze, la fenêtre des écrans. */
const DEFAULT_SERIES_MONTHS = 12

/**
 * LES CHIFFRES DE BELLUM — MRR figé mois par mois, et trésorerie saisie
 * (#1645, #1649).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE SERVICE N'ÉCRIT PAS, ET NE POURRA JAMAIS ÉCRIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Il LIT `subscriptions` et `manual_billing_terms`. Il n'a **aucun chemin
 * d'écriture** vers un abonnement, un prix, une facture ou un crédit : ce n'est
 * pas une convention, c'est l'absence de code — ses trois repositories en
 * écriture sont les trois tables neuves, et rien d'autre n'est injecté. Un
 * module de MESURE qui pourrait corriger ce qu'il mesure n'est plus une mesure.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * L'INSTANTANÉ EST IMMUABLE
 * ─────────────────────────────────────────────────────────────────────────────
 * `takeSnapshot` sur un mois déjà figé ne fait RIEN et le dit. C'est le test T1
 * de #1645 : « instantané d'un mois passé → identique après un changement
 * d'offre survenu depuis ». Un recalcul poli qui « rafraîchirait » un mois passé
 * détruirait la seule propriété qui rend la série lisible.
 */
@Injectable()
export class BusinessMetricsService {
  private readonly logger = new Logger(BusinessMetricsService.name)

  constructor(
    @InjectRepository(BusinessMetricSnapshotEntity)
    private readonly snapshots: Repository<BusinessMetricSnapshotEntity>,
    @InjectRepository(BusinessMetricSnapshotLineEntity)
    private readonly lines: Repository<BusinessMetricSnapshotLineEntity>,
    @InjectRepository(BusinessTreasuryMonthEntity)
    private readonly treasury: Repository<BusinessTreasuryMonthEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptions: Repository<SubscriptionEntity>,
    @InjectRepository(ManualBillingTermsEntity)
    private readonly terms: Repository<ManualBillingTermsEntity>,
    // #1646.6 — pour nommer un sujet facturé (`subject_id` = un `user_id`) sur
    // le tableau des mouvements. LECTURE SEULE : ni `workspaces` ni `profiles`
    // ne sont écrits ici, ce module reste un module de MESURE.
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    @Inject(PLAN_GRIDS) private readonly readGrids: PlanGridsReader,
  ) {}

  /** Ce qui serait figé si on prenait la photo à l'instant. */
  async currentPosition(): Promise<BusinessPosition> {
    const [grids, subs, terms] = await Promise.all([
      this.readGrids(),
      this.subscriptions.find({ select: { user_id: true, plan: true, extra_seats: true, billing_mode: true } }),
      this.terms.find({ select: { workspace_id: true, amount_cents: true, period: true } }),
    ])

    const lines = recurringLines(
      subs.map(row => ({
        userId: row.user_id,
        plan: row.plan,
        extraSeats: row.extra_seats,
        billingMode: row.billing_mode,
      })),
      grids.priceCents,
      grids.seatCents,
    )

    // Annoté plutôt qu'inféré : le jour où `manual_billing_terms` gagne une
    // périodicité, c'est ICI que la compilation s'arrête, pas dans un écran.
    const contractRows: ManualTermRow[] = terms.map(row => ({
      workspaceId: row.workspace_id,
      amountCents: row.amount_cents,
      period: row.period as ManualBillingPeriod,
    }))
    const contracted = contractedMonthlyCents(contractRows)

    return {
      lines,
      mrrCents: lines.reduce((sum, line) => sum + line.mrrCents, 0),
      customers: lines.length,
      contractedRevenueCents: contracted.recurringCents,
      contractedCustomers: contracted.recurringCustomers,
      oneOffCents: contracted.oneOffCents,
      oneOffCustomers: contracted.oneOffCustomers,
    }
  }

  /**
   * Fige un mois. Rend `frozen: false` si le mois l'était déjà — jamais une
   * erreur : rejouer le passage mensuel deux fois n'est pas un incident.
   */
  async takeSnapshot(month: string): Promise<{ frozen: boolean; month: string; snapshot: BusinessMonth }> {
    const existing = await this.snapshots.findOne({ where: { month } })
    if (existing) {
      return { frozen: false, month, snapshot: this.toMonth(existing) }
    }

    const position = await this.currentPosition()
    // Le mois précédent n'a de lignes que s'il a été figé. Sans lui, la série
    // commence ici : mrrStart vaut `null`, et pas zéro.
    const before = await this.snapshots.findOne({ where: { month: previousMonth(month) } })
    const previousLines = before
      ? (await this.lines.find({ where: { month: before.month } })).map(line => ({
          subjectId: line.subject_id,
          mrrCents: line.mrr_cents,
        }))
      : null

    const movements = computeMovements(previousLines, position.lines)

    const row = this.snapshots.create({
      month,
      mrr_start_cents: movements.mrrStartCents,
      mrr_new_cents: movements.mrrNewCents,
      mrr_expansion_cents: movements.mrrExpansionCents,
      mrr_contraction_cents: movements.mrrContractionCents,
      mrr_churned_cents: movements.mrrChurnedCents,
      mrr_end_cents: movements.mrrEndCents,
      customers_start: movements.customersStart,
      customers_new: movements.customersNew,
      customers_churned: movements.customersChurned,
      customers_end: movements.customersEnd,
      contracted_revenue_cents: position.contractedRevenueCents,
      contracted_customers: position.contractedCustomers,
      one_off_cents: position.oneOffCents,
      one_off_customers: position.oneOffCustomers,
    })
    // ⚠️ UNE SEULE TRANSACTION. Un instantané écrit sans ses lignes serait pire
    // qu'aucun instantané : le mois SUIVANT lirait « zéro ligne le mois
    // précédent » — indiscernable de « tout le monde est parti » — et
    // décomposerait la totalité du MRR en churn. Comme rien n'est jamais
    // recalculé, ce mensonge-là serait définitif.
    const saved = await this.snapshots.manager.transaction(async manager => {
      const written = await manager.save(BusinessMetricSnapshotEntity, row)
      if (position.lines.length > 0) {
        await manager.insert(
          BusinessMetricSnapshotLineEntity,
          position.lines.map(line => ({ month, subject_id: line.subjectId, mrr_cents: line.mrrCents })),
        )
      }
      return written
    })

    this.logger.log(
      `Instantané ${month} figé : MRR ${movements.mrrEndCents} c, ${movements.customersEnd} clients récurrents, ` +
        `${position.contractedRevenueCents} c contractés`,
    )

    return { frozen: true, month, snapshot: this.toMonth(saved) }
  }

  /** La série, du plus ancien au plus récent — l'ordre d'un graphique. */
  async series(months = DEFAULT_SERIES_MONTHS): Promise<BusinessMonth[]> {
    const rows = await this.snapshots.find({
      order: { month: 'DESC' },
      take: Math.max(1, Math.min(120, months)),
    })
    return rows.map(row => this.toMonth(row)).reverse()
  }

  /** Le mois que le passage mensuel doit figer : celui qui vient de finir. */
  monthToFreeze(now: Date): string {
    return previousMonth(monthOf(now))
  }

  /**
   * Le tableau des mouvements PAR CLIENT d'un mois FIGÉ (#1646.6) — ce que
   * `lectureDesMouvements()` côté cockpit annonçait « non mesurable ici ».
   *
   * Compare les lignes du mois demandé à celles du mois précédent au niveau
   * LIGNE (`business_metric_snapshot_lines`), classe chaque euro qui bouge via
   * {@link lineMovements} — LA seule dérivation de ce classement (GA-26), déjà
   * réutilisée par `computeMovements` pour l'agrégat — puis joint un nom
   * lisible au `subject_id` (un `user_id`) : le nom de l'espace dont il est
   * propriétaire, à défaut l'e-mail de son profil, à défaut `null`.
   *
   * Deux photos absentes ou un mois sans mouvement rendent le même tableau
   * VIDE : un client qui ne bouge pas n'a AUCUNE ligne, jamais une ligne à 0.
   */
  async monthlyClientMovements(month: string): Promise<MonthlyClientMovement[]> {
    const [currentLines, previousLines] = await Promise.all([
      this.lines.find({ where: { month } }),
      this.lines.find({ where: { month: previousMonth(month) } }),
    ])
    if (previousLines.length === 0) return []

    const previous: SnapshotLine[] = previousLines.map(line => ({
      subjectId: line.subject_id,
      mrrCents: line.mrr_cents,
    }))
    const current: SnapshotLine[] = currentLines.map(line => ({
      subjectId: line.subject_id,
      mrrCents: line.mrr_cents,
    }))
    const rows = lineMovements(previous, current)
    if (rows.length === 0) return []

    // Un seul aller-retour par table, quel que soit le nombre de lignes — la
    // table des espaces et celle des profils restent d'une taille que ce
    // back-office peut charger entière (mêmes ordres de grandeur que le reste
    // de l'admin), donc pas de filtre `IN (...)` à maintenir ici.
    const [workspaces, profiles] = await Promise.all([this.workspaces.find(), this.profiles.find()])
    const workspaceNameByOwner = new Map(workspaces.map(w => [w.owner_user_id, w.name]))
    const emailByUser = new Map(profiles.map(p => [p.user_id, p.email]))

    return rows.map(row => ({
      client: workspaceNameByOwner.get(row.subjectId) ?? emailByUser.get(row.subjectId) ?? null,
      nature: row.nature,
      montantCents: row.montantCents,
      month,
    }))
  }

  private toMonth(row: BusinessMetricSnapshotEntity): BusinessMonth {
    return {
      month: row.month,
      mrrStartCents: row.mrr_start_cents,
      mrrNewCents: row.mrr_new_cents,
      mrrExpansionCents: row.mrr_expansion_cents,
      mrrContractionCents: row.mrr_contraction_cents,
      mrrChurnedCents: row.mrr_churned_cents,
      mrrEndCents: row.mrr_end_cents,
      customersStart: row.customers_start,
      customersNew: row.customers_new,
      customersChurned: row.customers_churned,
      customersEnd: row.customers_end,
      contractedRevenueCents: row.contracted_revenue_cents,
      contractedCustomers: row.contracted_customers,
      oneOffCents: row.one_off_cents,
      oneOffCustomers: row.one_off_customers,
      computedAt: row.computed_at instanceof Date ? row.computed_at.toISOString() : String(row.computed_at),
    }
  }

  /* ─────────────────────────── Trésorerie (#1649) ─────────────────────────── */

  /**
   * Les mois saisis, plus ce qu'on en dérive.
   *
   * `averageBurn` et `runway` sont calculés sur le DERNIER mois saisi, pas sur
   * le mois courant : un runway ancré sur un mois vide dirait « non mesurable »
   * tous les 1ers du mois, ce qui apprendrait à ignorer la tuile.
   */
  async treasuryView(): Promise<TreasuryView> {
    const rows = await this.treasury.find({ order: { month: 'ASC' } })
    const months: TreasuryMonthView[] = rows.map(row => {
      const month: TreasuryMonth = {
        month: row.month,
        bankBalanceCents: row.bank_balance_cents,
        fixedExpensesCents: row.fixed_expenses_cents,
        variableExpensesCents: row.variable_expenses_cents,
        collectedCents: row.collected_cents,
      }
      return {
        ...month,
        burnCents: burnOf(month),
        updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : null,
        updatedBy: row.updated_by,
      }
    })

    const latestMonth = months.at(-1)?.month ?? null
    if (latestMonth === null) {
      return { months, latestMonth: null, averageBurn: null, runway: null }
    }

    return {
      months,
      latestMonth,
      averageBurn: averageBurnCents(months, latestMonth),
      runway: runwayMonths(months, latestMonth),
    }
  }

  /**
   * Saisit ou CORRIGE un mois. Rien n'est jamais pré-rempli avec le précédent :
   * un champ absent de l'entrée reste tel qu'il était, un champ à `null` est
   * effacé — et un mois qu'on n'a jamais ouvert n'existe pas du tout.
   */
  async saveTreasuryMonth(month: string, input: TreasuryInput, actor: string | null): Promise<TreasuryMonthView> {
    const existing = await this.treasury.findOne({ where: { month } })
    const row =
      existing ??
      this.treasury.create({
        month,
        bank_balance_cents: null,
        fixed_expenses_cents: null,
        variable_expenses_cents: null,
        collected_cents: null,
      })

    if (input.bankBalanceCents !== undefined) row.bank_balance_cents = input.bankBalanceCents
    if (input.fixedExpensesCents !== undefined) row.fixed_expenses_cents = input.fixedExpensesCents
    if (input.variableExpensesCents !== undefined) row.variable_expenses_cents = input.variableExpensesCents
    if (input.collectedCents !== undefined) row.collected_cents = input.collectedCents
    row.updated_by = actor

    const saved = await this.treasury.save(row)
    const view: TreasuryMonth = {
      month: saved.month,
      bankBalanceCents: saved.bank_balance_cents,
      fixedExpensesCents: saved.fixed_expenses_cents,
      variableExpensesCents: saved.variable_expenses_cents,
      collectedCents: saved.collected_cents,
    }
    return {
      ...view,
      burnCents: burnOf(view),
      updatedAt: saved.updated_at instanceof Date ? saved.updated_at.toISOString() : null,
      updatedBy: saved.updated_by,
    }
  }
}
