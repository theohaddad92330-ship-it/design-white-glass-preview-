import { ForbiddenException, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type {
  CommercialObjective,
  CommercialObjectiveAxis,
  MemberObjective,
  MemberObjectiveProgress,
  MyCommercialObjectivesResponse,
  MyObjectiveResponse,
  ObjectiveDataCoverage,
  TeamObjectives,
  UpsertMemberObjective,
} from '@bellum/contracts'
import { can } from '@bellum/contracts'
import { MemberObjectiveEntity } from '../../database/entities/member-objective.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/** Le 1er du mois d'une date, au format `YYYY-MM-01` (UTC). */
function firstOfMonth(date = new Date()): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${year}-${month}-01`
}

/**
 * Objectif commercial chiffré par membre (cockpit manager §10).
 *
 * Un membre déclare/consulte SON objectif du mois (`/objectives/me`) ; un manager
 * lit l'atteinte de son équipe (`/objectives/team`). Le réalisé est calculé sur
 * des données RÉELLES déjà en base (rendez-vous décrochés, comptes ouverts,
 * montants convertis) — jamais une cible ni un montant inventés.
 */
@Injectable()
export class ObjectivesService {
  private readonly logger = new Logger(ObjectivesService.name)

  constructor(
    @InjectRepository(MemberObjectiveEntity)
    private readonly repo: Repository<MemberObjectiveEntity>,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  /** L'objectif du membre pour le mois (courant par défaut), ou `null` si non déclaré. */
  async getMyObjective(userId: string, month?: string): Promise<MyObjectiveResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const period = month ?? firstOfMonth()
    const row = await this.repo.findOne({
      where: { user_id: userId, workspace_id: workspaceId, period_month: period },
    })
    return { period_month: period, objective: row ? toWire(row) : null }
  }

  /**
   * Déclarer / mettre à jour l'objectif du membre pour le mois. Sémantique partielle :
   * une cible omise n'est pas touchée, une cible à `null` est effacée. Read-modify-write
   * sur la clé unique (membre, workspace, mois) — pas de double objectif.
   */
  async upsertMyObjective(userId: string, body: UpsertMemberObjective): Promise<MemberObjective> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.workspaceContext.assertMember(userId, workspaceId)
    const period = body.period_month ?? firstOfMonth()

    const existing = await this.repo.findOne({
      where: { user_id: userId, workspace_id: workspaceId, period_month: period },
    })
    const entity = existing ?? this.repo.create({ user_id: userId, workspace_id: workspaceId, period_month: period })

    // Omise (undefined) → inchangée ; `null` → effacée ; nombre → posée.
    if (body.target_meetings !== undefined) entity.target_meetings = body.target_meetings
    if (body.target_accounts !== undefined) entity.target_accounts = body.target_accounts
    if (body.target_revenue !== undefined) {
      entity.target_revenue = body.target_revenue === null ? null : String(body.target_revenue)
    }
    if (body.target_qualified_needs !== undefined) entity.target_qualified_needs = body.target_qualified_needs
    if (body.target_placements !== undefined) entity.target_placements = body.target_placements
    if (body.target_margin_percent !== undefined) {
      entity.target_margin_percent = body.target_margin_percent === null ? null : String(body.target_margin_percent)
    }
    if (body.target_consultants_on_mission !== undefined) {
      entity.target_consultants_on_mission = body.target_consultants_on_mission
    }

    const saved = await this.repo.save(entity)
    return toWire(saved)
  }

  /**
   * Les SEPT objectifs commerciaux nommés du membre courant, pour le mois
   * (lot FA, #2114.16 à .27) — cible + réalisé RÉEL + période + couverture,
   * toujours les sept axes dans l'ordre de {@link COMMERCIAL_OBJECTIVE_AXES},
   * qu'une cible soit fixée ou non (« les objectifs de l'audit structurent le
   * cockpit », #2114.78).
   *
   * Aucune probabilité, aucun pourcentage d'atteinte : la cible et le réalisé
   * sont rendus tels quels, le lecteur fait la soustraction (doctrine,
   * refusée six fois sous forme de prévisionnel pondéré).
   */
  async getMyCommercialObjectives(userId: string, month?: string): Promise<MyCommercialObjectivesResponse> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const period = month ?? firstOfMonth()

    const target = await this.repo.findOne({
      where: { user_id: userId, workspace_id: workspaceId, period_month: period },
    })

    const [meetings, accounts, revenue, needs, placements, margin, consultants] = await Promise.all([
      this.meetingsForUser(workspaceId, userId, period),
      this.accountsForUser(workspaceId, userId, period),
      this.revenueForUser(workspaceId, userId, period),
      this.qualifiedNeedsForUser(workspaceId, userId, period),
      this.placementsForUser(workspaceId, userId, period),
      this.marginForUser(workspaceId, userId, period),
      this.consultantsOnMissionForUser(workspaceId, userId),
    ])

    const objective = (
      axis: CommercialObjectiveAxis,
      targetValue: number | null,
      achieved: number | null,
      coverage: ObjectiveDataCoverage,
    ): CommercialObjective => ({ axis, target: targetValue, achieved, period_month: period, coverage })

    const objectives: CommercialObjective[] = [
      objective('meetings', target?.target_meetings ?? null, meetings.achieved, meetings.coverage),
      objective('qualified_needs', target?.target_qualified_needs ?? null, needs.achieved, needs.coverage),
      objective('placements', target?.target_placements ?? null, placements.achieved, placements.coverage),
      objective(
        'revenue',
        target?.target_revenue === null || target?.target_revenue === undefined ? null : Number(target.target_revenue),
        revenue.achieved,
        revenue.coverage,
      ),
      objective(
        'margin',
        target?.target_margin_percent === null || target?.target_margin_percent === undefined
          ? null
          : Number(target.target_margin_percent),
        margin.achieved,
        margin.coverage,
      ),
      objective('new_accounts', target?.target_accounts ?? null, accounts.achieved, accounts.coverage),
      objective(
        'consultants_on_mission',
        target?.target_consultants_on_mission ?? null,
        consultants.achieved,
        consultants.coverage,
      ),
    ]

    return { period_month: period, objectives }
  }

  /**
   * L'atteinte de l'équipe pour le mois (cockpit manager, owner/admin). Ne renvoie
   * que les membres ayant déclaré au moins une cible — un membre sans objectif n'a
   * pas de ligne (jamais un 0/0 factice). Le réalisé est agrégé sur le mois.
   */
  async getTeamProgress(userId: string, month?: string): Promise<TeamObjectives> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    // ⚠️ `can()` et non un test de rôle en dur.
    //
    // Le rôle était comparé littéralement à `owner`/`admin`, si bien que
    // `sales_ops` — dont la définition MÊME est « commercial + gestion
    // d'équipe », et qui porte `team:manage` — se voyait refuser le cockpit.
    // Un rôle nommé dans un service ne dit rien de ce qu'il a le droit de
    // faire, et il ignore les permissions accordées nominativement.
    //
    // `team:manage` plutôt qu'une permission neuve : elle existe, elle est
    // portée par owner/admin/sales_ops, et elle veut dire exactement « cette
    // personne encadre une équipe » (décision du 22/08).
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, userId)
    if (!can(role, extra, 'team:manage')) {
      throw new ForbiddenException('Vue réservée à ceux qui encadrent une équipe.')
    }
    const period = month ?? firstOfMonth()

    const objectives = await this.repo.find({ where: { workspace_id: workspaceId, period_month: period } })
    const declared = objectives.filter(o => hasAnyTarget(o))
    if (declared.length === 0) return { period_month: period, members: [] }

    const [meetings, accounts, revenue] = await Promise.all([
      this.meetingsByUser(workspaceId, period),
      this.accountsByUser(workspaceId, period),
      this.revenueByUser(workspaceId, period),
    ])

    const members: MemberObjectiveProgress[] = declared.map(o => ({
      user_id: o.user_id,
      period_month: normalizeMonth(o.period_month),
      targets: {
        meetings: o.target_meetings ?? null,
        accounts: o.target_accounts ?? null,
        revenue: o.target_revenue === null ? null : Number(o.target_revenue),
      },
      achieved: {
        meetings: meetings.get(o.user_id) ?? 0,
        accounts: accounts.get(o.user_id) ?? 0,
        revenue: revenue.get(o.user_id) ?? 0,
      },
    }))

    return { period_month: period, members }
  }

  /** Rendez-vous décrochés sur le mois (trace réelle `user_actions` `rdv_obtained`). */
  private async meetingsByUser(workspaceId: string, period: string): Promise<Map<string, number>> {
    const rows = await this.repo.manager.query<{ userId: string; count: number }[]>(
      `SELECT user_id AS "userId", COUNT(*)::int AS "count"
       FROM user_actions
       WHERE workspace_id = $1 AND user_id IS NOT NULL AND action_type = 'rdv_obtained'
         AND created_at >= $2::date AND created_at < ($2::date + interval '1 month')
       GROUP BY user_id`,
      [workspaceId, period],
    )
    return new Map(rows.map(r => [r.userId, Number(r.count)]))
  }

  /** Comptes ouverts par le membre sur le mois (comptes créés, hors supprimés). */
  private async accountsByUser(workspaceId: string, period: string): Promise<Map<string, number>> {
    const rows = await this.repo.manager.query<{ userId: string; count: number }[]>(
      `SELECT user_id AS "userId", COUNT(*)::int AS "count"
       FROM accounts
       WHERE workspace_id = $1 AND user_id IS NOT NULL AND status <> 'deleted'
         AND created_at >= $2::date AND created_at < ($2::date + interval '1 month')
       GROUP BY user_id`,
      [workspaceId, period],
    )
    return new Map(rows.map(r => [r.userId, Number(r.count)]))
  }

  /**
   * Chiffre d'affaires réalisé sur le mois = somme des montants SAISIS des
   * opportunités converties ce mois, rattachées au responsable du compte. Ne somme
   * QUE des `estimated_amount` non nuls — jamais un montant inventé.
   */
  private async revenueByUser(workspaceId: string, period: string): Promise<Map<string, number>> {
    const rows = await this.repo.manager.query<{ userId: string; amount: number }[]>(
      `SELECT a.assigned_to AS "userId", COALESCE(SUM(o.estimated_amount), 0)::float8 AS "amount"
       FROM opportunities o
       JOIN accounts a ON a.id = o.account_id
       WHERE a.workspace_id = $1 AND a.assigned_to IS NOT NULL AND a.status <> 'deleted'
         AND o.stage = 'won'
         AND o.estimated_amount IS NOT NULL
         AND o.updated_at >= $2::date AND o.updated_at < ($2::date + interval '1 month')
       GROUP BY a.assigned_to`,
      [workspaceId, period],
    )
    return new Map(rows.map(r => [r.userId, Number(r.amount)]))
  }

  // ── Lot FA (#2114.16-.27) — le réalisé + la couverture d'UN membre, sur les
  // sept axes. Requêtes dédiées (pas un filtre sur les Map ci-dessus) : le
  // besoin est « ce membre, ce mois », pas « tout le workspace ».

  /** Rendez-vous décrochés — comptage binaire, couverture toujours complète. */
  private async meetingsForUser(
    workspaceId: string,
    userId: string,
    period: string,
  ): Promise<{ achieved: number; coverage: ObjectiveDataCoverage }> {
    const rows = await this.repo.manager.query<{ count: number }[]>(
      `SELECT COUNT(*)::int AS "count"
       FROM user_actions
       WHERE workspace_id = $1 AND user_id = $2 AND action_type = 'rdv_obtained'
         AND created_at >= $3::date AND created_at < ($3::date + interval '1 month')`,
      [workspaceId, userId, period],
    )
    const achieved = Number(rows[0]?.count ?? 0)
    return { achieved, coverage: { measured: achieved, total: achieved } }
  }

  /** Comptes ouverts par le membre — comptage binaire, couverture toujours complète. */
  private async accountsForUser(
    workspaceId: string,
    userId: string,
    period: string,
  ): Promise<{ achieved: number; coverage: ObjectiveDataCoverage }> {
    const rows = await this.repo.manager.query<{ count: number }[]>(
      `SELECT COUNT(*)::int AS "count"
       FROM accounts
       WHERE workspace_id = $1 AND user_id = $2 AND status <> 'deleted'
         AND created_at >= $3::date AND created_at < ($3::date + interval '1 month')`,
      [workspaceId, userId, period],
    )
    const achieved = Number(rows[0]?.count ?? 0)
    return { achieved, coverage: { measured: achieved, total: achieved } }
  }

  /**
   * Chiffre d'affaires réalisé — même règle que `revenueByUser` (somme des
   * montants SAISIS, jamais un montant inventé). `total` compte TOUTES les
   * affaires gagnées du mois, `measured` seulement celles qui portent un
   * montant : un `measured < total` NOMME les affaires gagnées sans montant
   * saisi plutôt que de les laisser invisibles dans une somme silencieuse.
   */
  private async revenueForUser(
    workspaceId: string,
    userId: string,
    period: string,
  ): Promise<{ achieved: number; coverage: ObjectiveDataCoverage }> {
    const rows = await this.repo.manager.query<{ measured: number; total: number; amount: number }[]>(
      `SELECT
         COUNT(*) FILTER (WHERE o.estimated_amount IS NOT NULL)::int AS "measured",
         COUNT(*)::int AS "total",
         COALESCE(SUM(o.estimated_amount), 0)::float8 AS "amount"
       FROM opportunities o
       JOIN accounts a ON a.id = o.account_id
       WHERE a.workspace_id = $1 AND a.assigned_to = $2 AND a.status <> 'deleted'
         AND o.stage = 'won'
         AND o.updated_at >= $3::date AND o.updated_at < ($3::date + interval '1 month')`,
      [workspaceId, userId, period],
    )
    const row = rows[0]
    return {
      achieved: Number(row?.amount ?? 0),
      coverage: { measured: Number(row?.measured ?? 0), total: Number(row?.total ?? 0) },
    }
  }

  /**
   * Besoins qualifiés ce mois (`project_needs.status = 'qualified'`).
   * `status_changed_at` est le seul repère de date d'un changement d'état ; un
   * besoin qualifié qui ne le porte pas (créé avant que la colonne existe)
   * ne peut pas être daté « ce mois-ci » — il compte dans `total` (c'est un
   * besoin qualifié réel) mais pas dans `measured`/`achieved`, pour ne jamais
   * lui inventer une date.
   */
  private async qualifiedNeedsForUser(
    workspaceId: string,
    userId: string,
    period: string,
  ): Promise<{ achieved: number; coverage: ObjectiveDataCoverage }> {
    const rows = await this.repo.manager.query<{ measured: number; total: number }[]>(
      `SELECT
         COUNT(*) FILTER (
           WHERE status_changed_at >= $3::date AND status_changed_at < ($3::date + interval '1 month')
         )::int AS "measured",
         COUNT(*)::int AS "total"
       FROM project_needs
       WHERE workspace_id = $1 AND owner_id = $2 AND status = 'qualified'`,
      [workspaceId, userId, period],
    )
    const row = rows[0]
    const measured = Number(row?.measured ?? 0)
    return { achieved: measured, coverage: { measured, total: Number(row?.total ?? measured) } }
  }

  /** Démarrages de mission ce mois — `started_on` est daté ou la mission ne
   *  compte pas comme un démarrage de la période (rien à couvrir). */
  private async placementsForUser(
    workspaceId: string,
    userId: string,
    period: string,
  ): Promise<{ achieved: number; coverage: ObjectiveDataCoverage }> {
    const rows = await this.repo.manager.query<{ count: number }[]>(
      `SELECT COUNT(*)::int AS "count"
       FROM missions
       WHERE workspace_id = $1 AND COALESCE(owner_id, user_id) = $2
         AND started_on >= $3::date AND started_on < ($3::date + interval '1 month')`,
      [workspaceId, userId, period],
    )
    const achieved = Number(rows[0]?.count ?? 0)
    return { achieved, coverage: { measured: achieved, total: achieved } }
  }

  /**
   * Marge réalisée sur les missions ACTIVES du membre ce mois. `daily_rate`
   * et `daily_cost` sont nullables SÉPARÉMENT (`mission.entity.ts`) : la
   * marge n'est calculée que quand les DEUX existent, jamais sur un coût
   * moyen supposé. `achieved` vaut `null` — pas `0` — quand AUCUNE mission
   * active n'a les deux : « 0 % de marge » dirait « mission à perte », ce
   * qui est une donnée inventée là où la vraie phrase est « non mesurée ».
   */
  private async marginForUser(
    workspaceId: string,
    userId: string,
    period: string,
  ): Promise<{ achieved: number | null; coverage: ObjectiveDataCoverage }> {
    const rows = await this.repo.manager.query<
      { measured: number; total: number; rate: number | null; cost: number | null }[]
    >(
      `SELECT
         COUNT(*) FILTER (WHERE daily_rate IS NOT NULL AND daily_cost IS NOT NULL)::int AS "measured",
         COUNT(*)::int AS "total",
         SUM(daily_rate) FILTER (WHERE daily_rate IS NOT NULL AND daily_cost IS NOT NULL)::float8 AS "rate",
         SUM(daily_cost) FILTER (WHERE daily_rate IS NOT NULL AND daily_cost IS NOT NULL)::float8 AS "cost"
       FROM missions
       WHERE workspace_id = $1 AND COALESCE(owner_id, user_id) = $2 AND status = 'active'
         AND started_on IS NOT NULL AND started_on < ($3::date + interval '1 month')
         AND (ends_on IS NULL OR ends_on >= $3::date)`,
      [workspaceId, userId, period],
    )
    const row = rows[0]
    const measured = Number(row?.measured ?? 0)
    const total = Number(row?.total ?? 0)
    // GA-66 : aucun `COALESCE(SUM(…), 0)` ci-dessus — `SUM()` sur zéro ligne rend
    // `NULL`, et ce `NULL` VOYAGE jusqu'ici au lieu d'être écrasé en `0` dans la
    // base. « Zéro euro de taux journalier cumulé » et « aucune mission dont le
    // taux ET le coût sont renseignés » sont deux phrases différentes ; la
    // seconde rend `achieved: null`, et `coverage` dit combien de missions
    // sortent du dénominateur (GA-18/GA-19).
    const rate = row?.rate == null ? null : Number(row.rate)
    const cost = row?.cost == null ? null : Number(row.cost)
    const achieved = measured === 0 || rate == null || cost == null || rate <= 0 ? null : ((rate - cost) / rate) * 100
    return { achieved, coverage: { measured, total } }
  }

  /**
   * Consultants en mission — un EFFECTIF constaté (comme `missions_active`
   * sur « Ma trajectoire »), pas un total du mois : `mission_assignments` est
   * la source de vérité de la disponibilité, comptée à la date d'aujourd'hui.
   */
  private async consultantsOnMissionForUser(
    workspaceId: string,
    userId: string,
  ): Promise<{ achieved: number; coverage: ObjectiveDataCoverage }> {
    const rows = await this.repo.manager.query<{ count: number }[]>(
      `SELECT COUNT(DISTINCT ma.consultant_id)::int AS "count"
       FROM mission_assignments ma
       JOIN missions m ON m.id = ma.mission_id
       WHERE m.workspace_id = $1 AND COALESCE(m.owner_id, m.user_id) = $2
         AND ma.starts_on <= CURRENT_DATE AND (ma.ends_on IS NULL OR ma.ends_on >= CURRENT_DATE)`,
      [workspaceId, userId],
    )
    const achieved = Number(rows[0]?.count ?? 0)
    return { achieved, coverage: { measured: achieved, total: achieved } }
  }
}

/** True dès qu'au moins une des trois cibles est renseignée. */
function hasAnyTarget(o: MemberObjectiveEntity): boolean {
  return o.target_meetings !== null || o.target_accounts !== null || o.target_revenue !== null
}

/** Normalise un `period_month` (Date ou string) au format `YYYY-MM-01`. */
function normalizeMonth(value: string | Date): string {
  return String(value).slice(0, 10)
}

function toWire(entity: MemberObjectiveEntity): MemberObjective {
  return {
    id: entity.id,
    user_id: entity.user_id,
    period_month: normalizeMonth(entity.period_month),
    target_meetings: entity.target_meetings ?? null,
    target_accounts: entity.target_accounts ?? null,
    target_revenue: entity.target_revenue === null ? null : Number(entity.target_revenue),
    target_qualified_needs: entity.target_qualified_needs ?? null,
    target_placements: entity.target_placements ?? null,
    target_margin_percent: entity.target_margin_percent === null ? null : Number(entity.target_margin_percent),
    target_consultants_on_mission: entity.target_consultants_on_mission ?? null,
    created_at: new Date(entity.created_at).toISOString(),
    updated_at: entity.updated_at ? new Date(entity.updated_at).toISOString() : undefined,
  }
}
