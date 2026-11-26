import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { AnalysisRunEntity } from '../../database/entities/analysis-run.entity'
import { BetaFeedbackEntity } from '../../database/entities/beta-feedback.entity'
import { ManualBillingTermsEntity } from '../../database/entities/manual-billing-terms.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SubscriptionEntity } from '../../database/entities/subscription.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { UserLastSeenEntity } from '../../database/entities/user-last-seen.entity'
import { WorkspaceEntity } from '../../database/entities/workspace.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
// ⚠️ Une DÉRIVATION VIT À UN SEUL ENDROIT. Le MRR d'un abonné est déjà calculé
// par #1645, à partir des deux grilles vivantes du catalogue ; le recalculer ici
// ferait DEUX définitions du MRR, qui divergeraient au premier changement de
// règle. `mrr-movements.ts` est un module PUR (aucun service), donc l'importer
// ne touche pas au compteur de GA-07 — et il n'est pas modifié.
import { recurringLines } from '../business-metrics/mrr-movements'
import { computeClientHealth, type ClientHealth } from './client-health'
import { CLIENT_PLAN_GRIDS, type ClientPlanGrids, type ClientPlanGridsReader } from './client-health-tokens'

/** La fenêtre sur laquelle adoption et incidents se mesurent. Un trimestre :
 *  assez long pour qu'un usage mensuel s'y voie, assez court pour que « ce
 *  client va mal » veuille dire quelque chose aujourd'hui. */
const WINDOW_DAYS = 90

/** Au-delà de ce silence, un membre n'est plus compté comme actif. */
const ACTIVE_MEMBER_DAYS = 30

/** Combien de lignes l'écran rend au plus. Le back-office en compte ~30 ; la
 *  borne existe pour qu'un jour à 5 000 espaces ne fasse pas tomber la page. */
const MAX_ROWS = 500

/** Ce qui paie, et comment. Trois états — `unknown` n'est pas `stripe`.
 *  Local : il ne voyage que DANS `AdminClientRow` (knip). */
interface AdminClientBilling {
  mode: 'stripe' | 'manual' | 'unknown'
  /** Le montant NÉGOCIÉ d'un client sur facture, en centimes. `null` sinon. */
  contractedCents: number | null
  /** `monthly` | `quarterly` | `yearly` | `one_off`. `null` hors facture. */
  period: string | null
}

/** Une ligne du tableau `/revenus/clients` : un ESPACE, jamais une personne. */
export interface AdminClientRow {
  workspaceId: string
  name: string
  ownerUserId: string
  ownerEmail: string | null
  /** La clé du palier, `null` quand l'espace n'a aucun abonnement lisible. */
  plan: string | null
  planLabel: string | null
  /**
   * MRR de l'espace, en centimes.
   *
   * `null` a TROIS causes, et aucune n'est « zéro euro » : pas d'abonnement,
   * client facturé sur facture (son revenu contracté est à côté), ou palier
   * absent de la grille — on ne devine pas un prix. `0` est en revanche un
   * chiffre MESURÉ : un abonnement Stripe sur un palier gratuit.
   */
  mrrCents: number | null
  /** Sièges payés = sièges du palier + sièges supplémentaires. */
  seats: number | null
  memberCount: number
  /** Membres vus dans les 30 derniers jours. `null` si aucune connexion connue. */
  activeMembers: number | null
  createdAt: string
  /** Dernier geste connu, tous membres confondus. `null` = aucune trace. */
  lastActivityAt: string | null
  creditsUsed: number | null
  creditsAllowance: number | null
  billing: AdminClientBilling
  health: ClientHealth
}

/** Ce que l'écran reçoit : les lignes, et de quoi elles ont été calculées. */
export interface AdminClientHealthReport {
  rows: AdminClientRow[]
  total: number
  /** La fenêtre d'adoption et d'incidents, dite à l'écran plutôt que devinée. */
  windowDays: number
  /**
   * Le catalogue OBSERVÉ de fonctions — le dénominateur de l'axe adoption.
   *
   * `null` quand aucun geste n'a été enregistré sur la fenêtre : dans ce cas
   * l'axe sort du calcul pour TOUT LE MONDE, plutôt que de noter chacun sur un
   * dénominateur inventé.
   */
  featureCatalogue: number | null
  computedAt: string
}

type ActionRollup = { lastAt: Date | string | null; kindsInWindow: number; rowsAllTime: number }

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/** `COUNT(*)` revient en TEXTE de Postgres. Un `Number(undefined)` vaut `NaN`. */
function count(raw: string | number | null | undefined): number {
  const value = Number(raw ?? 0)
  return Number.isFinite(value) ? value : 0
}

function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 86_400_000)
}

/**
 * LA SANTÉ DES ESPACES CLIENTS, telle que `/revenus/clients` la lit (#1652).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE SERVICE N'ÉCRIT RIEN, ET NE POURRA JAMAIS ÉCRIRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Ses neuf repositories sont en LECTURE ; il n'a aucun chemin vers une
 * écriture d'abonnement, de crédit, de prix ou de facture. Ce n'est pas une
 * convention, c'est l'absence de code — les quatre ACTIONS de la ligne
 * (incarner, suspendre, changer d'offre, créditer) passent par les routes qui
 * existaient déjà, chacune avec sa propre porte et son propre journal.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUCUN TRAITEMENT PÉRIODIQUE — LE SCORE SE CALCULE À LA LECTURE
 * ─────────────────────────────────────────────────────────────────────────────
 * Un `@Cron` qui figerait la santé chaque nuit ajouterait une table, un verrou
 * d'unicité, un interrupteur de coupure et une fenêtre pendant laquelle l'écran
 * montrerait la santé d'hier à un opérateur qui vient de créditer un client.
 * Le corpus est de l'ordre de la dizaine de milliers de lignes agrégées en
 * SQL : il n'y a rien à amortir.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QU'ON REFUSE DE MESURER, ET POURQUOI ON LE DIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `user_actions.workspace_id` et `analysis_runs.workspace_id` sont NULLABLES —
 * le passage `user_id → workspace_id` est en cours. Un espace sans aucune ligne
 * estampillée est donc indiscernable d'un espace non instrumenté : on rend
 * `null` (l'axe sort du dénominateur), jamais un zéro. Un espace qui a des
 * lignes mais aucune dans la fenêtre, lui, est bien mesuré à zéro — c'est un
 * fait, pas une lacune.
 */
@Injectable()
export class AdminClientHealthService {
  constructor(
    @InjectRepository(WorkspaceEntity)
    private readonly workspaces: Repository<WorkspaceEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly members: Repository<WorkspaceMemberEntity>,
    @InjectRepository(SubscriptionEntity)
    private readonly subscriptions: Repository<SubscriptionEntity>,
    @InjectRepository(ProfileEntity)
    private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(ManualBillingTermsEntity)
    private readonly terms: Repository<ManualBillingTermsEntity>,
    @InjectRepository(UserActionEntity)
    private readonly actions: Repository<UserActionEntity>,
    @InjectRepository(UserLastSeenEntity)
    private readonly lastSeen: Repository<UserLastSeenEntity>,
    @InjectRepository(AnalysisRunEntity)
    private readonly runs: Repository<AnalysisRunEntity>,
    @InjectRepository(BetaFeedbackEntity)
    private readonly feedback: Repository<BetaFeedbackEntity>,
    // La grille tarifaire arrive par un JETON — voir `client-health-tokens.ts`.
    @Inject(CLIENT_PLAN_GRIDS) private readonly readGrids: ClientPlanGridsReader,
  ) {}

  /**
   * Les espaces, avec leur santé. `now` est un PARAMÈTRE — le contrôleur passe
   * l'horloge, ce qui rend ce service testable sans figer le temps.
   */
  async list(query: { search?: string; now: Date }): Promise<AdminClientHealthReport> {
    const { now } = query
    const since = daysBefore(now, WINDOW_DAYS)
    const activeSince = daysBefore(now, ACTIVE_MEMBER_DAYS)

    const qb = this.workspaces.createQueryBuilder('w')
    if (query.search) qb.where('w.name ILIKE :s', { s: `%${query.search}%` })
    const total = await qb.clone().getCount()
    const rows = await qb.orderBy('w.created_at', 'DESC').limit(MAX_ROWS).getMany()

    if (rows.length === 0) {
      return { rows: [], total, windowDays: WINDOW_DAYS, featureCatalogue: null, computedAt: now.toISOString() }
    }

    const workspaceIds = rows.map(row => row.id)
    const ownerIds = [...new Set(rows.map(row => row.owner_user_id))]

    const [memberRows, grids, actionRollups, catalogue, runRollups, termRows] = await Promise.all([
      this.members
        .createQueryBuilder('m')
        .select('m.workspace_id', 'workspaceId')
        .addSelect('m.user_id', 'userId')
        .where('m.workspace_id IN (:...ids)', { ids: workspaceIds })
        .getRawMany<{ workspaceId: string; userId: string }>(),
      this.readGrids(),
      this.actionRollups(workspaceIds, since),
      this.featureCatalogue(since),
      this.runRollups(workspaceIds, since),
      this.terms.find({ where: { workspace_id: In(workspaceIds) } }),
    ])

    const memberIds = [...new Set(memberRows.map(row => row.userId))]
    const [subs, owners, seenRows, bugRows] = await Promise.all([
      this.subscriptions.find({ where: { user_id: In(ownerIds) } }),
      this.profiles.find({ where: { user_id: In(ownerIds) } }),
      memberIds.length > 0 ? this.lastSeen.find({ where: { user_id: In(memberIds) } }) : Promise.resolve([]),
      this.bugReportsByUser(memberIds, since),
    ])

    const membersByWorkspace = new Map<string, string[]>()
    for (const row of memberRows) {
      const list = membersByWorkspace.get(row.workspaceId) ?? []
      list.push(row.userId)
      membersByWorkspace.set(row.workspaceId, list)
    }
    const subByUser = new Map(subs.map(sub => [sub.user_id, sub]))
    const emailByUser = new Map(owners.map(owner => [owner.user_id, owner.email ?? null]))
    const seenByUser = new Map(seenRows.map(row => [row.user_id, toDate(row.last_seen_at)]))
    const termsByWorkspace = new Map(termRows.map(row => [row.workspace_id, row]))

    const built = rows.map(workspace =>
      this.buildRow({
        workspace,
        memberIds: membersByWorkspace.get(workspace.id) ?? [],
        sub: subByUser.get(workspace.owner_user_id) ?? null,
        ownerEmail: emailByUser.get(workspace.owner_user_id) ?? null,
        seenByUser,
        bugsByUser: bugRows,
        actions: actionRollups.get(workspace.id) ?? null,
        runs: runRollups.get(workspace.id) ?? null,
        terms: termsByWorkspace.get(workspace.id) ?? null,
        grids,
        catalogue,
        activeSince,
        now,
      }),
    )

    return {
      rows: built,
      total,
      windowDays: WINDOW_DAYS,
      featureCatalogue: catalogue,
      computedAt: now.toISOString(),
    }
  }

  /**
   * Par espace : le dernier geste (TOUTE l'histoire), le nombre de types de
   * gestes distincts DANS la fenêtre, et le nombre de lignes tout court.
   *
   * Le troisième compteur existe pour distinguer « cet espace n'a rien fait
   * depuis trois mois » (mesuré, adoption = 0) de « cet espace n'a aucune ligne
   * estampillée » (non mesurable) — la nuance qui empêche d'inventer un zéro.
   */
  private async actionRollups(workspaceIds: string[], since: Date): Promise<Map<string, ActionRollup>> {
    const raw = await this.actions
      .createQueryBuilder('a')
      .select('a.workspace_id', 'workspaceId')
      .addSelect('MAX(a.created_at)', 'lastAt')
      .addSelect('COUNT(DISTINCT a.action_type) FILTER (WHERE a.created_at >= :since)', 'kinds')
      .addSelect('COUNT(*)', 'rows')
      .where('a.workspace_id IN (:...ids)', { ids: workspaceIds })
      .setParameter('since', since)
      .groupBy('a.workspace_id')
      .getRawMany<{ workspaceId: string; lastAt: Date | string | null; kinds: string; rows: string }>()

    return new Map(
      raw.map(row => [
        row.workspaceId,
        { lastAt: row.lastAt, kindsInWindow: count(row.kinds), rowsAllTime: count(row.rows) },
      ]),
    )
  }

  /**
   * Le DÉNOMINATEUR de l'axe adoption : combien de types de gestes le produit a
   * réellement vus passer sur la fenêtre, tous espaces confondus.
   *
   * ⚠️ Mesuré, pas recopié. Une liste de fonctions écrite à la main ici
   * divergerait du produit au premier geste ajouté, et l'adoption se mettrait à
   * plafonner à 60 % pour tout le monde sans que personne ne sache pourquoi.
   * `null` quand rien n'a été enregistré — on ne note personne sur zéro.
   */
  private async featureCatalogue(since: Date): Promise<number | null> {
    const raw = await this.actions
      .createQueryBuilder('a')
      .select('COUNT(DISTINCT a.action_type)', 'kinds')
      .where('a.created_at >= :since', { since })
      .getRawOne<{ kinds: string }>()
    const kinds = count(raw?.kinds)
    return kinds > 0 ? kinds : null
  }

  /** Par espace : analyses lancées sur la fenêtre, et celles qui ont échoué. */
  private async runRollups(
    workspaceIds: string[],
    since: Date,
  ): Promise<Map<string, { total: number; errors: number }>> {
    const raw = await this.runs
      .createQueryBuilder('r')
      .select('r.workspace_id', 'workspaceId')
      .addSelect('COUNT(*)', 'total')
      .addSelect("COUNT(*) FILTER (WHERE r.status = 'error')", 'errors')
      .where('r.workspace_id IN (:...ids)', { ids: workspaceIds })
      .andWhere('r.created_at >= :since', { since })
      .groupBy('r.workspace_id')
      .getRawMany<{ workspaceId: string; total: string; errors: string }>()

    return new Map(raw.map(row => [row.workspaceId, { total: count(row.total), errors: count(row.errors) }]))
  }

  /**
   * Les signalements de BUG écrits par les membres, sur la fenêtre.
   *
   * ⚠️ `beta_feedback` ne porte PAS de `workspace_id` — seulement l'auteur. Un
   * membre de deux espaces voit donc son signalement compté dans les deux. La
   * limite est réelle et elle est écrite ici plutôt que corrigée par une
   * heuristique : deviner « son » espace choisirait au hasard entre deux
   * adhésions également valides.
   */
  private async bugReportsByUser(memberIds: string[], since: Date): Promise<Map<string, number>> {
    if (memberIds.length === 0) return new Map()
    const raw = await this.feedback
      .createQueryBuilder('f')
      .select('f.user_id', 'userId')
      .addSelect('COUNT(*)', 'total')
      .where('f.user_id IN (:...ids)', { ids: memberIds })
      .andWhere('f.created_at >= :since', { since })
      .andWhere("f.category = 'bug'")
      .groupBy('f.user_id')
      .getRawMany<{ userId: string; total: string }>()
    return new Map(raw.map(row => [row.userId, count(row.total)]))
  }

  private buildRow(input: {
    workspace: WorkspaceEntity
    memberIds: string[]
    sub: SubscriptionEntity | null
    ownerEmail: string | null
    seenByUser: Map<string, Date | null>
    bugsByUser: Map<string, number>
    actions: ActionRollup | null
    runs: { total: number; errors: number } | null
    terms: ManualBillingTermsEntity | null
    grids: ClientPlanGrids
    catalogue: number | null
    activeSince: Date
    now: Date
  }): AdminClientRow {
    const { workspace, memberIds, sub, grids, actions, runs, terms, catalogue, activeSince, now } = input

    // ── Dernier geste : le plus récent d'une action estampillée et d'une
    //    connexion de membre. Les deux sont partiels ; leur maximum l'est moins.
    const seenDates = memberIds
      .map(id => input.seenByUser.get(id) ?? null)
      .filter((date): date is Date => date instanceof Date)
    const candidates = [toDate(actions?.lastAt ?? null), ...seenDates].filter((date): date is Date => date !== null)
    const lastActivity = candidates.length > 0 ? new Date(Math.max(...candidates.map(d => d.getTime()))) : null

    // ── Membres actifs : mesurable seulement si AU MOINS une connexion est
    //    connue. Zéro connexion connue n'est pas zéro membre actif.
    const activeMembers = seenDates.length > 0 ? seenDates.filter(date => date >= activeSince).length : null

    // ── Sièges et crédits : ils viennent de l'abonnement du propriétaire, qui
    //    est le sujet facturé. Sans abonnement, les deux axes sortent.
    const planSeats = sub ? grids.seats[sub.plan] : undefined
    const seats = sub && planSeats !== undefined ? planSeats + Math.max(0, sub.extra_seats) : null
    const rolloverValid = sub?.rollover_expires_at ? toDate(sub.rollover_expires_at)! > now : false
    const creditsAllowance = sub
      ? sub.accounts_limit + (sub.topup_analyses ?? 0) + (rolloverValid ? (sub.rollover_credits ?? 0) : 0)
      : null
    const creditsUsed = sub ? sub.accounts_used : null

    // ── Adoption : mesurable dès que l'espace a UNE ligne estampillée.
    const featuresUsed = actions && actions.rowsAllTime > 0 ? actions.kindsInWindow : null

    // ── Incidents : analyses en erreur + bugs signalés par les membres,
    //    rapportés au volume d'analyses de la même fenêtre.
    const bugs = memberIds.reduce((sum, id) => sum + (input.bugsByUser.get(id) ?? 0), 0)
    const incidents = runs ? runs.errors + bugs : null

    const health = computeClientHealth(
      {
        createdAt: workspace.created_at,
        lastActivityAt: lastActivity,
        featuresUsed,
        featuresAvailable: catalogue,
        creditsUsed,
        creditsAllowance,
        activeMembers,
        seats,
        incidents,
        runs: runs ? runs.total : null,
      },
      now,
    )

    return {
      workspaceId: workspace.id,
      name: workspace.name,
      ownerUserId: workspace.owner_user_id,
      ownerEmail: input.ownerEmail,
      plan: sub?.plan ?? null,
      planLabel: sub ? (grids.labels[sub.plan] ?? sub.plan) : null,
      mrrCents: mrrCentsOf(sub, grids),
      seats,
      memberCount: memberIds.length,
      activeMembers,
      createdAt: toIso(workspace.created_at) ?? '',
      lastActivityAt: lastActivity ? lastActivity.toISOString() : null,
      creditsUsed,
      creditsAllowance,
      billing: {
        mode: sub ? sub.billing_mode : 'unknown',
        contractedCents: terms ? terms.amount_cents : null,
        period: terms ? terms.period : null,
      },
      health,
    }
  }
}

/**
 * Le MRR d'un espace, en centimes — ou `null` quand il n'y en a pas à dire.
 *
 * Trois refus explicites, chacun pour ne pas inventer un chiffre :
 *  - pas d'abonnement → on ne sait rien ;
 *  - `billing_mode = 'manual'` → un contrat facturé n'est PAS du MRR (#1645),
 *    et son montant négocié voyage à côté, sous son vrai nom ;
 *  - palier absent de la grille → on ne devine pas un prix.
 *
 * Le calcul lui-même est délégué à `recurringLines` : c'est la MÊME dérivation
 * que la série mensuelle, et deux chemins qui la referaient divergeraient.
 */
function mrrCentsOf(sub: SubscriptionEntity | null, grids: ClientPlanGrids): number | null {
  if (!sub) return null
  if (sub.billing_mode !== 'stripe') return null
  if (grids.priceCents[sub.plan] === undefined) return null
  const [line] = recurringLines(
    [{ userId: sub.user_id, plan: sub.plan, extraSeats: sub.extra_seats, billingMode: 'stripe' }],
    grids.priceCents,
    grids.seatCents,
  )
  // `recurringLines` écarte les lignes à zéro (elles ne sont pas des CLIENTS
  // payants). Ici, zéro est un chiffre mesuré : un abonnement sur un palier
  // gratuit rapporte zéro euro, et c'est vrai.
  return line?.mrrCents ?? 0
}
