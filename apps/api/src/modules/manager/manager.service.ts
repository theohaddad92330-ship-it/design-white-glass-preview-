import { ForbiddenException, Injectable, Optional } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { can, projectStageInSql } from '@bellum/contracts'
import type {
  ManagerTeamStats,
  ManagerMemberStats,
  ManagerUnassignedAccount,
  ManagerDuplicateAccount,
  ManagerCoverageMap,
  ManagerCoverageSegment,
  ManagerActivityEvent,
  ManagerCreditsUsage,
  ManagerSharedActions,
  ManagerAgenda,
  ManagerPlaybooks,
  ManagerPipelineValue,
  ManagerCoaching,
  ManagerRoutineMemberEntry,
  ManagerRoutinesOverview,
  ManagerTrend,
  RoutineChannel,
  RoutineStatus,
  WorkspaceRole,
} from '@bellum/contracts'
import { DEFAULT_MANAGER_PERIOD_DAYS, LIVE_STAGES, PROJECT_STAGES, type ManagerPeriodDays } from '@bellum/contracts'
import { calendarDate } from '../../database/calendar-date'
// ⚠️ Imports de MODULES PURS (données/fonctions, aucun `@Injectable`), pas du
// service `routines` — GA-07 ne compte que les imports de service à service
// (`*.service.ts`) et celui-ci n'en est pas un. Réutilise le MÊME catalogue et
// le MÊME calcul de prochain déclenchement que `RoutinesService.list`, jamais
// une seconde lecture du catalogue ou un second calcul de date (GA-26).
import { findRoutine } from '../routines/routine-catalog'
import { nextRoutineTrigger } from '../routines/routine-schedule'
import { DEMO_COLLEAGUES, DEMO_OWNER } from '../demo/demo-dataset'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import type { BusinessUnitScopeClause } from '../accounts/business-unit-scope.clause'
import { accountRefScopeAnd, accountScopeAnd } from './manager-bu-scope'
import {
  ManagerPeriodReader,
  PIPELINE_INACTIVITY_DAYS,
  PIPELINE_STUCK_DAYS,
  periodWindow,
} from './manager-period.reader'

/** Les stades ENCORE EN JEU, en littéraux SQL. Les valeurs viennent de
 *  l'énumération du contrat, jamais d'une saisie — aucune interpolation
 *  d'entrée utilisateur ici. */

type MemberRow = {
  userId: string
  role: WorkspaceRole
  firstName: string | null
  lastName: string | null
  email: string | null
  isDemo?: boolean
}

/**
 * An assigned account with no team activity for this many days counts as
 * "stale". Anchored on the method's 10-day cadence (J1/J3/J6/J9): past ~two
 * weeks without a touch, the account has fallen out of cadence. It counts
 * ACCOUNTS, never a person's activity — the question is "which accounts are
 * slipping", not "who is slow".
 */
const STALE_ACCOUNT_DAYS = PIPELINE_INACTIVITY_DAYS

/**
 * #2405.6 — COACHING PARTI D'UN FAIT DATÉ, JAMAIS D'UN JUGEMENT.
 *
 * Une opportunité LIVE (même périmètre que {@link LIVE_STAGES}) dont le stade
 * n'a pas bougé depuis ce nombre de jours compte comme « sans action » — le
 * même proxy que `stage_entered_at`, déjà écrit par le pivot de projet
 * (`ProjectPivot` migration), sans colonne nouvelle. `MIN_COUNT` borne le
 * bruit : une seule opportunité qui traîne n'est pas un sujet de coaching, un
 * motif qui s'en tient à trois l'est. Les deux seuils sont volontairement FIXES
 * (pas de variable d'env) : ce ne sont pas des réglages d'exploitation, c'est
 * la définition du signal.
 */
const COACHING_STALE_OPPORTUNITY_DAYS = PIPELINE_STUCK_DAYS
const COACHING_STALE_OPPORTUNITY_MIN_COUNT = 3

/** How many unassigned accounts to ship inline so the manager can act at once. */
const UNASSIGNED_SAMPLE_LIMIT = 12

/** How many duplicate-covered accounts to surface (restitution V2 §10). */
const DUPLICATE_SAMPLE_LIMIT = 12

/**
 * Combien d'actions partagées on embarque inline (maquette p.11, bloc 8). Le
 * compteur complet voyage à part : la file est une tête de liste, pas le total.
 */
const SHARED_ACTIONS_SAMPLE_LIMIT = 15

/** Longueur du fil « Activité récente » (maquette p.11, bloc 6). */
const RECENT_ACTIVITY_LIMIT = 15

/**
 * Horizon de l'agenda d'équipe (maquette p.11, bloc 7) : les échéances des 7
 * prochains jours. Une semaine est la maille de relance qu'un manager arbitre —
 * au-delà, ce n'est plus « ce qui vient », c'est le fond de la file.
 */
const AGENDA_WINDOW_DAYS = 7

/** Combien de rappels on embarque inline ; le compteur complet voyage à part. */
const AGENDA_SAMPLE_LIMIT = 30

/**
 * Kinds `library_items` considérés comme des PLAYBOOKS (maquette p.11, bloc 11).
 * Les `template` (emails/pitchs prêts à copier) restent hors de ce bloc — c'est
 * l'onglet Playbooks de Connaissances qui est ramené ici, pas les modèles.
 */
const PLAYBOOK_KINDS = ['playbook', 'method_playbook'] as const

/** Combien de playbooks partagés on liste inline (le total voyage à part). */
const PLAYBOOKS_SAMPLE_LIMIT = 12

/**
 * Combien de segments par axe de la carte de couverture (restitution V2 §10).
 * Les axes ont une longue traîne (un compte = un secteur exotique) ; le manager
 * arbitre sur les mailles qui pèsent, pas sur la queue de distribution.
 */
const COVERAGE_SEGMENT_LIMIT = 8

/** Une ligne « valeur d'axe × responsable » telle que la renvoie Postgres. */
type CoverageRow = { label: string | null; userId: string | null; count: number }

/**
 * Manager / Head-of-Sales dashboard. Aggregates a workspace's whole team —
 * per-rep + team totals — for the owner/admin (the buyer persona). All queries
 * are scoped to the caller's active workspace and gated to owner/admin.
 */
@Injectable()
export class ManagerService {
  /** #4158 (lot L7) — les lectures de la période choisie à l'écran. */
  private readonly periodReader: ManagerPeriodReader

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly workspaceContext: WorkspaceContextService,
    // #4158 (complément BU) — le périmètre BU de l'appelant. `@Optional()` pour le CONSTRUCTEUR (specs positionnelles),
    // jamais pour la RÈGLE : absent, `resolveBusinessUnitScope` LÈVE (fail-closed).
    @Optional() private readonly businessUnits?: BusinessUnitService,
  ) {
    this.periodReader = new ManagerPeriodReader(dataSource)
  }

  async getTeamStats(
    userId: string,
    periodDays: ManagerPeriodDays = DEFAULT_MANAGER_PERIOD_DAYS,
  ): Promise<ManagerTeamStats> {
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

    // #4158 (complément BU) — le périmètre BU, résolu UNE fois au bord (comme `accounts.controller.ts`), puis passé à
    // CHAQUE lecture qui nomme ou compte un compte. Les lectures qui ne touchent aucun compte restent
    // sur l'espace (membres, crédits, invitations, consultants, bibliothèque).
    const bu = await resolveBusinessUnitScope(this.businessUnits, workspaceId, userId)

    const [
      members,
      accountsByUser,
      contactAgg,
      analysesByUser,
      lastActivity,
      pipeline,
      workspaceName,
      assignedByUser,
      staleByUser,
      coverage,
      unassignedSample,
      creditsByUser,
      duplicateAccounts,
      coverageMap,
      sharedActions,
      recentActivity,
      credits,
      trend,
      opportunitiesByUser,
      agenda,
      playbooks,
      pipelineValue,
      staleOpportunitiesByUser,
    ] = await Promise.all([
      this.listMembers(workspaceId),
      this.countByUser('accounts', workspaceId, bu),
      this.contactAggByUser(workspaceId, bu),
      this.countByUser('analysis_runs', workspaceId, bu),
      this.lastActivityByUser(workspaceId),
      this.teamPipeline(workspaceId, bu),
      this.workspaceName(workspaceId),
      this.assignedAccountsByUser(workspaceId, bu),
      this.staleAssignedByUser(workspaceId, bu),
      this.portfolioCoverage(workspaceId, bu),
      this.unassignedAccounts(workspaceId, bu),
      this.creditsConsumedByUser(workspaceId),
      this.duplicateCoverage(workspaceId, bu),
      this.coverageMap(workspaceId, bu),
      this.sharedActions(workspaceId, bu),
      this.recentActivity(workspaceId, bu),
      this.creditsUsage(workspaceId),
      this.monthlyTrend(workspaceId, bu),
      this.openOpportunitiesByOwner(workspaceId, bu),
      this.teamAgenda(workspaceId, bu),
      this.sharedPlaybooks(workspaceId),
      this.pipelineValue(workspaceId, bu),
      this.staleOpportunitiesByUser(workspaceId, bu),
    ])

    // #2399.8 (axe WORKSPACE) — dépend de `members` déjà résolu ci-dessus,
    // donc hors du `Promise.all` (qui ne peut pas encore le lire).
    const routines = await this.teamRoutines(members)

    // #4158.37-43 (lot L7) — la PÉRIODE choisie à l'écran (`?periode=`), sur le
    // MÊME espace actif, après la même porte `team:manage` ci-dessus.
    const span = periodWindow(periodDays)
    const [pulse, memberPeriod, pipelineReview, staffing, pendingInvitations, awaitingEsnProfile, periodActivity] =
      await Promise.all([
        this.periodReader.pulse(workspaceId, span, bu),
        this.periodReader.memberPeriodStats(workspaceId, span, bu),
        this.periodReader.pipelineReview(workspaceId, bu),
        this.periodReader.staffing(workspaceId, bu),
        this.periodReader.pendingInvitations(workspaceId),
        this.periodReader.awaitingEsnProfile(workspaceId, members),
        this.periodReader.periodActivity(workspaceId, span, bu),
      ])

    const memberStats: ManagerMemberStats[] = members
      .map(m => {
        const c = contactAgg.get(m.userId)
        return {
          user_id: m.userId,
          name: demoColleague(m) ? `${demoColleague(m)?.first_name} ${demoColleague(m)?.last_name}` : displayName(m),
          // Une salle démo ne montre JAMAIS l'adresse d'un compte réel (profil du pool) : chaque
          // collègue fictif porte la sienne, la propriétaire celle de la persona (R21-FIX, 15/10).
          email: m.isDemo ? (demoColleague(m)?.email ?? DEMO_OWNER.email) : (m.email ?? ''),
          role: m.role,
          accounts: accountsByUser.get(m.userId) ?? 0,
          contacts: c?.contacts ?? 0,
          emails_sent: c?.emailsSent ?? 0,
          analyses: analysesByUser.get(m.userId) ?? 0,
          last_activity_at: lastActivity.get(m.userId) ?? null,
          assigned_accounts: assignedByUser.get(m.userId) ?? 0,
          stale_accounts: staleByUser.get(m.userId) ?? 0,
          credits_consumed: creditsByUser.get(m.userId) ?? 0,
          opportunities: opportunitiesByUser.get(m.userId) ?? 0,
          open_actions: memberPeriod.get(m.userId)?.open ?? 0,
          overdue_actions: memberPeriod.get(m.userId)?.overdue ?? 0,
          period_activity: memberPeriod.get(m.userId)?.activity ?? 0,
        }
      })
      // Portfolio first — the manager reads this screen to balance the load,
      // and an unassigned-heavy workspace should surface its biggest holders.
      // `?? 0` only satisfies the now-optional wire type: THIS service always
      // populates both counts. The field is optional in the contract because an
      // OLDER deployed API omits it, which is a statement about the wire, not
      // about what this code produces.
      .sort((a, b) => (b.assigned_accounts ?? 0) - (a.assigned_accounts ?? 0) || b.contacts - a.contacts)

    // #2405.6 — un fait daté par commercial, dans l'ordre de l'ÉQUIPE
    // (`members`, non trié par `count`) : trier par ampleur classerait les
    // personnes, exactement ce que #2405.7 interdit dans ce cockpit. Seuls les
    // membres au-delà du seuil de bruit apparaissent — pas de ligne à 0 ni à 1.
    const coaching: ManagerCoaching = {
      stale_opportunities: members
        .map(m => ({
          member_user_id: m.userId,
          member_name: displayName(m),
          count: staleOpportunitiesByUser.get(m.userId) ?? 0,
          days: COACHING_STALE_OPPORTUNITY_DAYS,
        }))
        .filter(entry => entry.count >= COACHING_STALE_OPPORTUNITY_MIN_COUNT),
    }

    const totals = memberStats.reduce(
      (acc, m) => ({
        accounts: acc.accounts + m.accounts,
        contacts: acc.contacts + m.contacts,
        emails_sent: acc.emails_sent + m.emails_sent,
        analyses: acc.analyses + m.analyses,
      }),
      { accounts: 0, contacts: 0, emails_sent: 0, analyses: 0 },
    )

    return {
      workspace: { id: workspaceId, name: workspaceName, member_count: members.length },
      totals,
      pipeline,
      members: memberStats,
      coverage,
      unassigned_sample: unassignedSample,
      duplicate_coverage: { accounts: duplicateAccounts },
      coverage_map: coverageMap,
      shared_actions: sharedActions,
      recent_activity: recentActivity,
      // `credits` reste absent quand le workspace n'a pas d'abonnement lisible :
      // on ne sait pas quel est le quota, et un quota inventé serait pire que
      // pas de bloc du tout.
      ...(credits ? { credits } : {}),
      trend,
      agenda,
      playbooks,
      pipeline_value: pipelineValue,
      coaching,
      routines,
      period: {
        days: span.days,
        since: span.since.toISOString(),
        previous_since: span.previousSince.toISOString(),
      },
      pulse,
      pipeline_review: pipelineReview,
      staffing,
      pending_invitations: pendingInvitations,
      awaiting_esn_profile: awaitingEsnProfile,
      period_activity: periodActivity,
    }
  }

  private async listMembers(workspaceId: string): Promise<MemberRow[]> {
    return this.dataSource.query<MemberRow[]>(
      `SELECT m.user_id AS "userId", m.role AS "role",
              p.first_name AS "firstName", p.last_name AS "lastName", p.email AS "email",
              w.is_demo AS "isDemo"
       FROM workspace_members m
       JOIN workspaces w ON w.id = m.workspace_id
       LEFT JOIN profiles p ON p.user_id = m.user_id
       WHERE m.workspace_id = $1`,
      [workspaceId],
    )
  }

  // COUNT(*) per user for a workspace-scoped table with a `user_id` column.
  private async countByUser(
    table: 'accounts' | 'analysis_runs',
    workspaceId: string,
    bu: BusinessUnitScopeClause,
  ): Promise<Map<string, number>> {
    // #4158 (complément BU) — une analyse pointe un compte : elle suit le périmètre de SON compte.
    const scope = table === 'accounts' ? accountScopeAnd(bu, 'business_unit_id') : accountRefScopeAnd(bu, 'account_id')
    const rows = await this.dataSource.query<{ userId: string; count: number }[]>(
      `SELECT user_id AS "userId", COUNT(*)::int AS "count" FROM ${table} WHERE workspace_id = $1${scope} GROUP BY user_id`,
      [workspaceId],
    )
    return new Map(rows.map(r => [r.userId, Number(r.count)]))
  }

  private async contactAggByUser(
    workspaceId: string,
    bu: BusinessUnitScopeClause,
  ): Promise<Map<string, { contacts: number; emailsSent: number }>> {
    const rows = await this.dataSource.query<{ userId: string; contacts: number; emailsSent: number }[]>(
      `SELECT user_id AS "userId", COUNT(*)::int AS "contacts",
              COUNT(*) FILTER (WHERE email_sent_at IS NOT NULL)::int AS "emailsSent"
       FROM contacts WHERE workspace_id = $1${accountRefScopeAnd(bu, 'account_id')} GROUP BY user_id`,
      [workspaceId],
    )
    return new Map(rows.map(r => [r.userId, { contacts: Number(r.contacts), emailsSent: Number(r.emailsSent) }]))
  }

  private async lastActivityByUser(workspaceId: string): Promise<Map<string, string | null>> {
    const rows = await this.dataSource.query<{ userId: string; lastAt: Date | string | null }[]>(
      `SELECT user_id AS "userId", MAX(created_at) AS "lastAt"
       FROM user_actions WHERE workspace_id = $1 GROUP BY user_id`,
      [workspaceId],
    )
    return new Map(rows.map(r => [r.userId, r.lastAt ? new Date(r.lastAt).toISOString() : null]))
  }

  private async teamPipeline(
    workspaceId: string,
    bu: BusinessUnitScopeClause,
  ): Promise<{ status: string; count: number }[]> {
    const rows = await this.dataSource.query<{ status: string; count: number }[]>(
      `SELECT user_status AS "status", COUNT(*)::int AS "count"
       FROM contacts WHERE workspace_id = $1${accountRefScopeAnd(bu, 'account_id')} GROUP BY user_status ORDER BY "count" DESC`,
      [workspaceId],
    )
    return rows.map(r => ({ status: r.status, count: Number(r.count) }))
  }

  /**
   * Portefeuille per member — accounts explicitly assigned, NOT accounts
   * created. Archived accounts are excluded everywhere in this block: an
   * archived account needs no owner and would only inflate the numbers.
   */
  private async assignedAccountsByUser(workspaceId: string, bu: BusinessUnitScopeClause): Promise<Map<string, number>> {
    const rows = await this.dataSource.query<{ userId: string; count: number }[]>(
      `SELECT assigned_to AS "userId", COUNT(*)::int AS "count"
       FROM accounts
       WHERE workspace_id = $1 AND assigned_to IS NOT NULL AND commercial_status <> 'archived'${accountScopeAnd(bu, 'business_unit_id')}
       GROUP BY assigned_to`,
      [workspaceId],
    )
    return new Map(rows.map(r => [r.userId, Number(r.count)]))
  }

  /**
   * Assigned accounts with no team activity for {@link STALE_ACCOUNT_DAYS}.
   * The activity probe is workspace-wide, not per-user: a colleague's touch
   * keeps the account warm, because the question is whether the ACCOUNT is
   * moving — not whether its holder personally typed something.
   */
  private async staleAssignedByUser(workspaceId: string, bu: BusinessUnitScopeClause): Promise<Map<string, number>> {
    const rows = await this.dataSource.query<{ userId: string; count: number }[]>(
      `SELECT a.assigned_to AS "userId", COUNT(*)::int AS "count"
       FROM accounts a
       LEFT JOIN LATERAL (
         SELECT MAX(ua.created_at) AS last_at
         FROM user_actions ua
         WHERE ua.account_id = a.id AND ua.workspace_id = $1
       ) act ON TRUE
       WHERE a.workspace_id = $1
         AND a.assigned_to IS NOT NULL
         AND a.commercial_status <> 'archived'${accountScopeAnd(bu, 'a.business_unit_id')}
         AND (act.last_at IS NULL OR act.last_at < now() - make_interval(days => $2))
       GROUP BY a.assigned_to`,
      [workspaceId, STALE_ACCOUNT_DAYS],
    )
    return new Map(rows.map(r => [r.userId, Number(r.count)]))
  }

  /** How much of the workspace portfolio actually has an owner. */
  private async portfolioCoverage(
    workspaceId: string,
    bu: BusinessUnitScopeClause,
  ): Promise<{ total_accounts: number; assigned: number; unassigned: number }> {
    const rows = await this.dataSource.query<{ total: number; assigned: number }[]>(
      `SELECT COUNT(*)::int AS "total",
              COUNT(*) FILTER (WHERE assigned_to IS NOT NULL)::int AS "assigned"
       FROM accounts WHERE workspace_id = $1 AND commercial_status <> 'archived'${accountScopeAnd(bu, 'business_unit_id')}`,
      [workspaceId],
    )
    const total = Number(rows[0]?.total ?? 0)
    const assigned = Number(rows[0]?.assigned ?? 0)
    return { total_accounts: total, assigned, unassigned: total - assigned }
  }

  /** Head of the to-assign queue, most recent first. */
  private async unassignedAccounts(
    workspaceId: string,
    bu: BusinessUnitScopeClause,
  ): Promise<ManagerUnassignedAccount[]> {
    const rows = await this.dataSource.query<
      {
        id: string
        companyName: string
        sector: string | null
        priorityScore: number | null
        commercialStatus: string
        createdAt: Date | string
      }[]
    >(
      `SELECT id, company_name AS "companyName", sector, priority_score AS "priorityScore",
              commercial_status AS "commercialStatus", created_at AS "createdAt"
       FROM accounts
       WHERE workspace_id = $1 AND assigned_to IS NULL AND commercial_status <> 'archived'${accountScopeAnd(bu, 'business_unit_id')}
       ORDER BY created_at DESC
       LIMIT $2`,
      [workspaceId, UNASSIGNED_SAMPLE_LIMIT],
    )
    return rows.map(r => ({
      id: r.id,
      company_name: r.companyName,
      sector: r.sector,
      priority_score: r.priorityScore === null ? null : Number(r.priorityScore),
      commercial_status: r.commercialStatus,
      created_at: new Date(r.createdAt).toISOString(),
    }))
  }

  /**
   * Crédits consommés par membre (restitution V2 §9-10). Attribution via
   * `credit_ledger.actor_user_id` (le membre qui a déclenché) ; `-SUM(delta)`
   * car les lignes `consume_*` portent un delta négatif. All-time, comme le
   * reste de l'écran in-app (l'opérateur/backoffice a sa propre vue fenêtrée).
   * Les lignes sans `actor_user_id` (non attribuables) sont ignorées.
   */
  private async creditsConsumedByUser(workspaceId: string): Promise<Map<string, number>> {
    const rows = await this.dataSource.query<{ userId: string; consumed: number }[]>(
      `SELECT actor_user_id AS "userId",
              COALESCE(-SUM(delta) FILTER (WHERE kind IN ('consume_analysis','consume_enrichment')), 0)::int AS "consumed"
       FROM credit_ledger
       WHERE workspace_id = $1 AND actor_user_id IS NOT NULL
       GROUP BY actor_user_id`,
      [workspaceId],
    )
    return new Map(rows.map(r => [r.userId, Number(r.consumed)]))
  }

  /**
   * Doublons de couverture (restitution V2 §10) : comptes travaillés par 2+
   * commerciaux distincts, mesuré sur l'activité réelle (`user_actions`). C'est
   * le signal le plus net « deux sales sur le même compte » — le manager peut
   * coordonner avant que les deux brûlent le compte.
   */
  private async duplicateCoverage(
    workspaceId: string,
    bu: BusinessUnitScopeClause,
  ): Promise<ManagerDuplicateAccount[]> {
    const rows = await this.dataSource.query<
      { accountId: string; companyName: string; repCount: number; reps: string[] }[]
    >(
      `SELECT ua.account_id AS "accountId",
              a.company_name AS "companyName",
              COUNT(DISTINCT ua.user_id)::int AS "repCount",
              array_agg(DISTINCT ua.user_id) AS "reps"
       FROM user_actions ua
       JOIN accounts a ON a.id = ua.account_id
       WHERE ua.workspace_id = $1 AND ua.account_id IS NOT NULL${accountScopeAnd(bu, 'a.business_unit_id')}
       GROUP BY ua.account_id, a.company_name
       HAVING COUNT(DISTINCT ua.user_id) >= 2
       ORDER BY "repCount" DESC
       LIMIT $2`,
      [workspaceId, DUPLICATE_SAMPLE_LIMIT],
    )
    return rows.map(r => ({
      account_id: r.accountId,
      company_name: r.companyName,
      rep_count: Number(r.repCount),
      reps: (r.reps ?? []).filter(Boolean),
    }))
  }

  /**
   * Carte de couverture (restitution V2 §10) : qui couvre quel secteur, quel
   * territoire, quel persona. Trois axes, trois agrégats « valeur × responsable »
   * — c'est le croisement qui répond à la vraie question du manager : « sur quoi
   * suis-je aveugle ? » (segment sans propriétaire = zone blanche).
   *
   * La propriété se lit sur `accounts.assigned_to` (le portefeuille officiel),
   * pas sur l'activité : la question est « qui EST responsable », pas « qui a
   * cliqué ». Comptes archivés exclus partout, comme le reste de l'écran.
   */
  private async coverageMap(workspaceId: string, bu: BusinessUnitScopeClause): Promise<ManagerCoverageMap> {
    const [sectors, territories, personas] = await Promise.all([
      this.dataSource.query<CoverageRow[]>(
        `SELECT btrim(sector) AS "label", assigned_to AS "userId", COUNT(*)::int AS "count"
         FROM accounts
         WHERE workspace_id = $1 AND commercial_status <> 'archived'
           AND sector IS NOT NULL AND btrim(sector) <> ''${accountScopeAnd(bu, 'business_unit_id')}
         GROUP BY btrim(sector), assigned_to`,
        [workspaceId],
      ),
      // `headquarters` est du texte libre, typiquement « Ville, Pays ». On
      // regroupe sur le premier segment (la ville) : c'est la seule maille
      // qu'on peut DÉRIVER sans rien inventer — on ne devine ni région, ni
      // département, ni pays à partir d'une chaîne libre.
      this.dataSource.query<CoverageRow[]>(
        `SELECT btrim(split_part(headquarters, ',', 1)) AS "label", assigned_to AS "userId",
                COUNT(*)::int AS "count"
         FROM accounts
         WHERE workspace_id = $1 AND commercial_status <> 'archived'
           AND headquarters IS NOT NULL AND btrim(split_part(headquarters, ',', 1)) <> ''${accountScopeAnd(bu, 'business_unit_id')}
         GROUP BY btrim(split_part(headquarters, ',', 1)), assigned_to`,
        [workspaceId],
      ),
      // Le persona n'existe qu'au niveau contact (`decision_role`, taxonomie
      // MEDDIC) ; on le rattache au responsable via SON compte. Les contacts
      // masqués sont écartés : le commercial les a déjà jugés hors-sujet.
      this.dataSource.query<CoverageRow[]>(
        `SELECT c.decision_role AS "label", a.assigned_to AS "userId", COUNT(*)::int AS "count"
         FROM contacts c
         JOIN accounts a ON a.id = c.account_id
         WHERE c.workspace_id = $1 AND c.hidden = false
           AND c.decision_role IS NOT NULL AND btrim(c.decision_role) <> ''
           AND a.commercial_status <> 'archived'${accountScopeAnd(bu, 'a.business_unit_id')}
         GROUP BY c.decision_role, a.assigned_to`,
        [workspaceId],
      ),
    ])

    return {
      sectors: toCoverageSegments(sectors),
      territories: toCoverageSegments(territories),
      personas: toCoverageSegments(personas),
    }
  }

  /**
   * File d'actions partagées (maquette p.11, bloc 8). La délégation existait
   * déjà (`action_plan_items.assigned_to`, menu « Assigner à » sur le plan d'un
   * compte) mais ne se lisait que compte par compte : le manager n'avait aucune
   * vue de la charge d'équipe. Deux requêtes volontairement séparées — le
   * COMPTEUR (le dénominateur, sur toute la file) et la TÊTE de file (ce qu'on
   * affiche). Un total tronqué à la taille de l'échantillon mentirait.
   *
   * Le périmètre « ouvert » exclut le fait (`done` / `execution_status = done`)
   * et le reporté encore parqué (`snoozed_until` dans le futur) : une action
   * snoozée n'est pas à traiter aujourd'hui. Le scope équipe se lit sur le
   * COMPTE (`accounts.workspace_id`) — `action_plan_items` n'a pas de colonne
   * workspace, et le compte est de toute façon le porteur de l'action.
   */
  private async sharedActions(workspaceId: string, bu: BusinessUnitScopeClause): Promise<ManagerSharedActions> {
    const OPEN_SCOPE = `FROM action_plan_items i
       JOIN accounts a ON a.id = i.account_id
       WHERE a.workspace_id = $1
         AND a.commercial_status <> 'archived'${accountScopeAnd(bu, 'a.business_unit_id')}
         AND i.done = false
         AND i.execution_status <> 'done'
         AND (i.snoozed_until IS NULL OR i.snoozed_until <= now())`

    const [counts, rows] = await Promise.all([
      this.dataSource.query<{ open: number; overdue: number; delegated: number }[]>(
        `SELECT COUNT(*)::int AS "open",
                COUNT(*) FILTER (WHERE i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE)::int AS "overdue",
                COUNT(*) FILTER (WHERE i.assigned_to IS NOT NULL)::int AS "delegated"
         ${OPEN_SCOPE}`,
        [workspaceId],
      ),
      this.dataSource.query<
        {
          id: string
          label: string
          accountId: string
          companyName: string
          // Une colonne `DATE` revient en objet `Date` avec le pilote `pg` ; la
          // chaîne n'existe qu'en test et en mode `dateStrings`.
          dueDate: Date | string | null
          ownerUserId: string
          assignedTo: string | null
          overdue: boolean
        }[]
      >(
        `SELECT i.id, i.label, i.account_id AS "accountId", a.company_name AS "companyName",
                i.due_date AS "dueDate", i.user_id AS "ownerUserId", i.assigned_to AS "assignedTo",
                (i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS "overdue"
         ${OPEN_SCOPE}
         -- Le retard d'abord, puis l'échéance la plus proche ; les actions sans
         -- date ferment la marche (elles n'ont pas d'urgence datée à opposer).
         ORDER BY (i.due_date IS NULL), i.due_date ASC, i.created_at ASC
         LIMIT $2`,
        [workspaceId, SHARED_ACTIONS_SAMPLE_LIMIT],
      ),
    ])

    return {
      open: Number(counts[0]?.open ?? 0),
      overdue: Number(counts[0]?.overdue ?? 0),
      delegated: Number(counts[0]?.delegated ?? 0),
      items: rows.map(r => ({
        id: r.id,
        label: r.label,
        account_id: r.accountId,
        company_name: r.companyName,
        // `calendarDate` et jamais `String(…).slice(0, 10)` : une colonne DATE
        // revient en objet `Date`, dont la forme texte commence par « Fri Aug ».
        due_date: calendarDate(r.dueDate),
        overdue: r.overdue === true,
        owner_user_id: r.ownerUserId,
        assigned_to: r.assignedTo,
      })),
    }
  }

  /**
   * Fil « Activité récente » (maquette p.11, bloc 6) — les dernières traces
   * réelles de l'équipe. C'est la même source que le Journal d'activité
   * (`user_actions`), simplement ramenée sur le cockpit : le manager n'a plus à
   * changer d'écran pour savoir ce qui vient de se passer.
   */
  private async recentActivity(workspaceId: string, bu: BusinessUnitScopeClause): Promise<ManagerActivityEvent[]> {
    const rows = await this.dataSource.query<
      {
        id: string
        userId: string | null
        actionType: string
        accountId: string | null
        companyName: string | null
        createdAt: Date | string
      }[]
    >(
      `SELECT ua.id, ua.user_id AS "userId", ua.action_type AS "actionType",
              ua.account_id AS "accountId", a.company_name AS "companyName",
              ua.created_at AS "createdAt"
       FROM user_actions ua
       LEFT JOIN accounts a ON a.id = ua.account_id
       WHERE ua.workspace_id = $1${accountRefScopeAnd(bu, 'ua.account_id')}
       ORDER BY ua.created_at DESC
       LIMIT $2`,
      [workspaceId, RECENT_ACTIVITY_LIMIT],
    )
    return rows.map(r => ({
      id: r.id,
      user_id: r.userId,
      action_type: r.actionType,
      account_id: r.accountId,
      company_name: r.companyName,
      created_at: new Date(r.createdAt).toISOString(),
    }))
  }

  /**
   * Bloc « Crédits & usage IA » (maquette p.11, bloc 9). L'écran affichait un
   * nombre de crédits par ligne, jamais rapporté à un quota — le cas d'école du
   * « chiffre sans dénominateur ». Ici la consommation du cycle EST rapportée à
   * la capacité du cycle.
   *
   * Le pool est celui du PROPRIÉTAIRE du workspace (`subscriptions` est indexée
   * par le user payeur, cf. `CreditsService.resolveBillingSubscription`), donc
   * partagé par tous les membres — d'où la ventilation par membre sur la même
   * fenêtre. Sans ligne d'abonnement lisible on renvoie `null` : le bloc
   * disparaît plutôt que d'afficher un quota deviné.
   *
   * MONNAIE UNIQUE : une seule jauge, parce qu'il n'y a plus qu'un seul pool.
   * Analyse et enrichissement débitent tous deux `accounts_used`
   * (`CreditsService.consumeEnrichmentCredit`). La jauge « Enrichissements »
   * lisait encore `subscriptions.enrichment_credits`, un solde que plus rien ne
   * débite : elle annonçait « 0 restant » à côté de centaines de crédits
   * disponibles. On ne la remplace pas par un chiffre reconstruit — on la retire.
   */
  private async creditsUsage(workspaceId: string): Promise<ManagerCreditsUsage | null> {
    const subRows = await this.dataSource.query<
      {
        creditsUsed: number
        creditsTotal: number
        periodStart: Date | string
      }[]
    >(
      `SELECT s.accounts_used AS "creditsUsed",
              -- #3544.2 : MÊME capacité que le solde de la barre latérale
              -- (creditCapacity) : plan + recharge + report ENCORE valide.
              (s.accounts_limit + s.topup_analyses
                 + CASE WHEN s.rollover_expires_at > now() THEN s.rollover_credits ELSE 0 END) AS "creditsTotal",
              s.period_start AS "periodStart"
       FROM workspaces w
       JOIN subscriptions s ON s.user_id = w.owner_user_id
       WHERE w.id = $1`,
      [workspaceId],
    )
    const sub = subRows[0]
    if (!sub) return null

    // Sans début de cycle exploitable, la fenêtre de consommation n'existe pas :
    // on ne sait pas de quelle période on parle, donc on ne parle pas.
    const periodStart = new Date(sub.periodStart)
    if (Number.isNaN(periodStart.getTime())) return null
    // Consommation NETTE du cycle : un geste remboursé n'a pas été consommé.
    // Les deux `resource` s'additionnent — c'est la même monnaie depuis la
    // fusion des pools, et le ledger continue de les étiqueter séparément.
    const ledger = await this.dataSource.query<{ userId: string | null; credits: number }[]>(
      `SELECT actor_user_id AS "userId",
              COALESCE(-SUM(delta), 0)::int AS "credits"
       FROM credit_ledger
       WHERE workspace_id = $1
         AND kind IN ('consume_analysis', 'refund_analysis', 'consume_enrichment', 'refund_enrichment')
         AND created_at >= $2
       GROUP BY actor_user_id`,
      [workspaceId, periodStart.toISOString()],
    )

    return {
      period_start: periodStart.toISOString(),
      credits: {
        used: Math.max(0, Number(sub.creditsUsed ?? 0)),
        total: Math.max(0, Number(sub.creditsTotal ?? 0)),
      },
      by_member: ledger
        // Les mouvements non attribuables (pas d'acteur connu) comptent dans le
        // total mais ne s'inventent pas un propriétaire dans le classement.
        .filter((r): r is { userId: string; credits: number } => !!r.userId)
        .map(r => ({ user_id: r.userId, credits: Number(r.credits ?? 0) }))
        .filter(r => r.credits > 0)
        .sort((a, b) => b.credits - a.credits),
    }
  }

  /**
   * Opportunités OUVERTES par propriétaire de compte (maquette p.11, bloc 4).
   * Le scope équipe se lit sur le COMPTE (`opportunities.workspace_id` est
   * nullable — roll-out en cours — alors que le compte, lui, est toujours
   * rattaché). Seuls les stades ENCORE EN JEU comptent : ce bloc mesure ce
   * qu'il reste à travailler, pas l'historique. `dormant` en est dehors — il
   * n'y a rien à y faire tant que personne ne l'a réveillé, et c'est le rôle
   * d'une routine de relance, pas d'un compteur de charge.
   */
  private async openOpportunitiesByOwner(
    workspaceId: string,
    bu: BusinessUnitScopeClause,
  ): Promise<Map<string, number>> {
    const rows = await this.dataSource.query<{ userId: string; count: number }[]>(
      `SELECT a.assigned_to AS "userId", COUNT(*)::int AS "count"
       FROM opportunities o
       JOIN accounts a ON a.id = o.account_id
       WHERE a.workspace_id = $1
         AND a.assigned_to IS NOT NULL
         AND a.commercial_status <> 'archived'${accountScopeAnd(bu, 'a.business_unit_id')}
         AND ${projectStageInSql('o.stage', LIVE_STAGES)}
       GROUP BY a.assigned_to`,
      [workspaceId],
    )
    return new Map(rows.map(r => [r.userId, Number(r.count)]))
  }

  /**
   * #2405.6 — opportunités LIVE sans changement de stade depuis
   * {@link COACHING_STALE_OPPORTUNITY_DAYS} jours, par commercial. Même
   * périmètre que {@link openOpportunitiesByOwner} (comptes actifs, stades
   * encore en jeu) : la question posée est « ce qui traîne parmi ce qu'il
   * reste à travailler », pas l'historique clos.
   */
  private async staleOpportunitiesByUser(
    workspaceId: string,
    bu: BusinessUnitScopeClause,
  ): Promise<Map<string, number>> {
    const rows = await this.dataSource.query<{ userId: string; count: number }[]>(
      `SELECT a.assigned_to AS "userId", COUNT(*)::int AS "count"
       FROM opportunities o
       JOIN accounts a ON a.id = o.account_id
       WHERE a.workspace_id = $1
         AND a.assigned_to IS NOT NULL
         AND a.commercial_status <> 'archived'${accountScopeAnd(bu, 'a.business_unit_id')}
         AND ${projectStageInSql('o.stage', LIVE_STAGES)}
         AND o.stage_entered_at < now() - make_interval(days => $2)
       GROUP BY a.assigned_to`,
      [workspaceId, COACHING_STALE_OPPORTUNITY_DAYS],
    )
    return new Map(rows.map(r => [r.userId, Number(r.count)]))
  }

  /**
   * Pipeline partagé valorisé en euros (cockpit manager §10). Somme les montants
   * RÉELLEMENT SAISIS (`opportunities.estimated_amount`) par étage de cycle de vie,
   * plus le total d'équipe. Règle absolue : un montant non renseigné n'entre PAS
   * dans la somme — il est compté à part (`without_amount`), jamais forcé à 0 comme
   * si c'était une valeur.
   *
   * Le scope se lit sur le COMPTE (`opportunities.workspace_id` est nullable —
   * roll-out en cours) ; comptes supprimés et archivés exclus, comme le reste du
   * cockpit. Tri des étages selon l'ordre canonique du cycle de vie.
   *
   * ─────────────────────────────────────────────────────────────────────────
   * UN TOTAL N'ADDITIONNE JAMAIS DEUX STATUTS (29/08/2026)
   * ─────────────────────────────────────────────────────────────────────────
   * Cette requête n'avait AUCUN prédicat de stade : `total_amount` sommait le
   * détecté, l'ouvert, le SIGNÉ, le PERDU et le DORMANT en un seul chiffre en
   * gras. Un montant perdu dans une « valeur de pipeline » ne se lit d'aucune
   * façon défendable, et le chiffre ne baissait jamais — gagner une affaire la
   * faisait changer d'étage sans la faire quitter le total.
   *
   * Le périmètre est celui de `openOpportunitiesByOwner` ci-dessus — même
   * cockpit, même question (« ce qu'il reste à travailler »), donc le même
   * `LIVE_STAGES`, RÉFÉRENCÉ et non recopié (GA-57). Le compte de la charge
   * était déjà borné ; c'est le montant, à côté, qui ne l'était pas.
   */
  private async pipelineValue(workspaceId: string, bu: BusinessUnitScopeClause): Promise<ManagerPipelineValue> {
    const rows = await this.dataSource.query<{ lifecycle: string; amount: number; valued: number; total: number }[]>(
      `SELECT o.stage AS "lifecycle",
              COALESCE(SUM(o.estimated_amount) FILTER (WHERE o.estimated_amount IS NOT NULL), 0)::float8 AS "amount",
              COUNT(*) FILTER (WHERE o.estimated_amount IS NOT NULL)::int AS "valued",
              COUNT(*)::int AS "total"
       FROM opportunities o
       JOIN accounts a ON a.id = o.account_id
       WHERE (o.workspace_id = $1 OR a.workspace_id = $1)
         AND a.status <> 'deleted'
         AND a.commercial_status <> 'archived'${accountScopeAnd(bu, 'a.business_unit_id')}
         AND ${projectStageInSql('o.stage', LIVE_STAGES)}
       GROUP BY o.stage`,
      [workspaceId],
    )

    const orderOf = (lifecycle: string): number => {
      const idx = (PROJECT_STAGES as readonly string[]).indexOf(lifecycle)
      // Une valeur hors cycle (ne devrait pas exister — CHECK en base) ferme la marche.
      return idx === -1 ? PROJECT_STAGES.length : idx
    }

    const byStage = rows
      .map(r => ({
        stage: r.lifecycle,
        amount: Number(r.amount ?? 0),
        valued_count: Number(r.valued ?? 0),
        total_count: Number(r.total ?? 0),
      }))
      .sort((a, b) => orderOf(a.stage) - orderOf(b.stage))

    return {
      currency: 'EUR',
      total_amount: byStage.reduce((sum, s) => sum + s.amount, 0),
      valued_count: byStage.reduce((sum, s) => sum + s.valued_count, 0),
      // Le dénominateur honnête : les opportunités qu'aucun humain n'a chiffrées.
      without_amount: byStage.reduce((sum, s) => sum + (s.total_count - s.valued_count), 0),
      by_stage: byStage,
    }
  }

  /**
   * Agenda d'équipe (maquette p.11, bloc 7 — « Rappels & agenda »). Les
   * échéances qui tombent dans les {@link AGENDA_WINDOW_DAYS} prochains jours,
   * rangées sous le commercial qui les PORTE (délégataire `assigned_to` sinon
   * auteur du plan `user_id`) — le manager lit « qui a quoi cette semaine ».
   *
   * C'est la même table que la file d'actions partagées, sous un autre angle : la
   * file trie le retard (échéances passées ou nulles), l'agenda ne montre QUE le
   * proche à venir (`due_date >= aujourd'hui`). Le scope équipe se lit sur le
   * COMPTE (`accounts.workspace_id`) — `action_plan_items` n'a pas de colonne
   * workspace. Périmètre ouvert identique (ni fait, ni snoozé encore parqué).
   *
   * Deux requêtes séparées, comme la file d'actions : le COMPTEUR de toute la
   * fenêtre (le dénominateur) et la TÊTE d'agenda affichée. Un total tronqué à la
   * taille de l'échantillon mentirait sur la charge de la semaine.
   */
  private async teamAgenda(workspaceId: string, bu: BusinessUnitScopeClause): Promise<ManagerAgenda> {
    const WINDOW = `FROM action_plan_items i
       JOIN accounts a ON a.id = i.account_id
       WHERE a.workspace_id = $1
         AND a.commercial_status <> 'archived'${accountScopeAnd(bu, 'a.business_unit_id')}
         AND i.done = false
         AND i.execution_status <> 'done'
         AND (i.snoozed_until IS NULL OR i.snoozed_until <= now())
         AND i.due_date IS NOT NULL
         AND i.due_date >= CURRENT_DATE
         AND i.due_date <= CURRENT_DATE + ($2)::int`

    const [counts, rows] = await Promise.all([
      this.dataSource.query<{ total: number }[]>(`SELECT COUNT(*)::int AS "total" ${WINDOW}`, [
        workspaceId,
        AGENDA_WINDOW_DAYS,
      ]),
      this.dataSource.query<
        {
          id: string
          label: string
          accountId: string
          companyName: string
          dueDate: string | Date
          holderUserId: string
        }[]
      >(
        `SELECT i.id, i.label, i.account_id AS "accountId", a.company_name AS "companyName",
                i.due_date AS "dueDate", COALESCE(i.assigned_to, i.user_id) AS "holderUserId"
         ${WINDOW}
         -- L'échéance la plus proche d'abord ; à date égale, l'ordre du plan.
         ORDER BY i.due_date ASC, i.created_at ASC
         LIMIT $3`,
        [workspaceId, AGENDA_WINDOW_DAYS, AGENDA_SAMPLE_LIMIT],
      ),
    ])

    return {
      window_days: AGENDA_WINDOW_DAYS,
      total: Number(counts[0]?.total ?? 0),
      // Une ligne dont l'échéance ne se lit pas est ÉCARTÉE plutôt que rendue
      // avec une date approximative : le bloc ne montre que des échéances
      // datées, et une date fausse y serait indistinguable d'une vraie.
      items: rows.flatMap(r => {
        const dueDate = calendarDate(r.dueDate)
        if (!dueDate) return []
        return [
          {
            id: r.id,
            label: r.label,
            account_id: r.accountId,
            company_name: r.companyName,
            due_date: dueDate,
            holder_user_id: r.holderUserId,
          },
        ]
      }),
    }
  }

  /**
   * Playbooks partagés de l'espace de travail (maquette p.11, bloc 11), lus depuis
   * `library_items` (kinds {@link PLAYBOOK_KINDS}). On ramène sur le cockpit ce
   * que l'onglet Playbooks de Connaissances contient déjà, avec un lien vers
   * `/knowledge` côté front.
   *
   * La maquette montre aussi un « taux de réussite » par playbook : il n'existe
   * AUCUN compteur d'usage sur `library_items` (pas de colonne, pas de journal),
   * donc on ne le sert pas — un taux inventé violerait « jamais de donnée fictive ».
   * On lit uniquement par `workspace_id` (barrière d'équipe), jamais par user :
   * un playbook est un bien commun de l'espace. Lecture pure — pas de seed ici
   * (le seed paresseux appartient au `LibraryService`, au premier accès à l'écran
   * Connaissances) : un espace jamais visité montre zéro playbook, ce qui est vrai.
   */
  private async sharedPlaybooks(workspaceId: string): Promise<ManagerPlaybooks> {
    const kinds = [...PLAYBOOK_KINDS]
    const [counts, rows] = await Promise.all([
      this.dataSource.query<{ total: number }[]>(
        `SELECT COUNT(*)::int AS "total"
         FROM library_items
         WHERE workspace_id = $1 AND kind = ANY($2)`,
        [workspaceId, kinds],
      ),
      this.dataSource.query<{ id: string; title: string; category: string | null; kind: string }[]>(
        `SELECT id, title, category, kind
         FROM library_items
         WHERE workspace_id = $1 AND kind = ANY($2)
         ORDER BY kind ASC, title ASC
         LIMIT $3`,
        [workspaceId, kinds, PLAYBOOKS_SAMPLE_LIMIT],
      ),
    ])

    return {
      total: Number(counts[0]?.total ?? 0),
      items: rows.map(r => ({ id: r.id, title: r.title, category: r.category, kind: r.kind })),
    }
  }

  /**
   * Évolution mois en cours vs mois précédent des quatre totaux d'en-tête
   * (maquette p.11, bloc 2). Un volume cumulé depuis toujours ne dit rien à un
   * manager : ce qu'il lit, c'est le rythme. Mois CALENDAIRES (et non fenêtres
   * glissantes) pour que « ce mois-ci » veuille dire la même chose que sur sa
   * facture et son objectif.
   *
   * Chaque métrique est comptée sur SA date d'événement : création du compte,
   * du contact, de l'analyse, et `email_sent_at` pour les emails — jamais la
   * date de création de la ligne, qui répondrait à une autre question.
   */
  private async monthlyTrend(workspaceId: string, bu: BusinessUnitScopeClause): Promise<ManagerTrend> {
    const CURRENT = `date_trunc('month', now())`
    const window = (column: string) =>
      `COUNT(*) FILTER (WHERE ${column} >= ${CURRENT})::int AS "current",
       COUNT(*) FILTER (WHERE ${column} >= ${CURRENT} - interval '1 month' AND ${column} < ${CURRENT})::int AS "previous"`

    const [accounts, contacts, analyses] = await Promise.all([
      this.dataSource.query<{ current: number; previous: number }[]>(
        `SELECT ${window('created_at')} FROM accounts WHERE workspace_id = $1${accountScopeAnd(bu, 'business_unit_id')}`,
        [workspaceId],
      ),
      this.dataSource.query<{ current: number; previous: number; emailsCurrent: number; emailsPrevious: number }[]>(
        `SELECT ${window('created_at')},
                COUNT(*) FILTER (WHERE email_sent_at >= ${CURRENT})::int AS "emailsCurrent",
                COUNT(*) FILTER (WHERE email_sent_at >= ${CURRENT} - interval '1 month'
                                   AND email_sent_at < ${CURRENT})::int AS "emailsPrevious"
         FROM contacts WHERE workspace_id = $1${accountRefScopeAnd(bu, 'account_id')}`,
        [workspaceId],
      ),
      this.dataSource.query<{ current: number; previous: number }[]>(
        `SELECT ${window('created_at')} FROM analysis_runs WHERE workspace_id = $1${accountRefScopeAnd(bu, 'account_id')}`,
        [workspaceId],
      ),
    ])

    const point = (row: { current?: number; previous?: number } | undefined) => ({
      current: Number(row?.current ?? 0),
      previous: Number(row?.previous ?? 0),
    })

    return {
      accounts: point(accounts[0]),
      contacts: point(contacts[0]),
      emails_sent: {
        current: Number(contacts[0]?.emailsCurrent ?? 0),
        previous: Number(contacts[0]?.emailsPrevious ?? 0),
      },
      analyses: point(analyses[0]),
    }
  }

  /**
   * #2399.8 (axe WORKSPACE) — vue manager des routines d'équipe, LECTURE SEULE.
   *
   * `RoutinesController` reste `@PersonalScope` sur la classe : aucune de ses
   * routes ne sert la donnée d'un AUTRE membre. Cette lecture vit donc ici,
   * dans le cockpit déjà gardé par `team:manage` (voir {@link getTeamStats}),
   * plutôt que percer une seconde porte à côté de la première.
   *
   * « On n'affiche pas ce qu'on n'a pas » (doctrine, 20/09/2026) : seules les
   * lignes RÉELLEMENT matérialisées (`routine_subscriptions`) apparaissent —
   * jamais les 42 clés du catalogue complétées par leur défaut pour un membre
   * qui n'a encore jamais ouvert Réglages › Routines. Un membre sans ligne
   * matérialisée n'apparaît pas dans `members` : une liste vide serait un bruit
   * identique pour « n'a rien configuré » et « a tout désactivé », deux faits
   * différents qu'aucune ligne ne permet de distinguer honnêtement.
   *
   * Le CORPS des messages ne sort jamais (doctrine) : ni ici ni ailleurs — seul
   * `outcome` (déjà un texte d'ÉTAT, jamais un contenu envoyé à un contact,
   * voir `RoutinesService`) sert à dériver `lastFailed`.
   */
  private async teamRoutines(members: MemberRow[]): Promise<ManagerRoutinesOverview> {
    const memberIds = members.map(m => m.userId)
    if (memberIds.length === 0) return { members: [] }

    const [subscriptionRows, lastRunRows] = await Promise.all([
      this.dataSource.query<
        {
          userId: string
          routineKey: string
          status: RoutineStatus
          channel: RoutineChannel
          hour: number
          weekday: number | null
          timeZone: string
        }[]
      >(
        `SELECT user_id AS "userId", routine_key AS "routineKey", status, channel,
                hour, weekday, time_zone AS "timeZone"
         FROM routine_subscriptions
         WHERE user_id = ANY($1)`,
        [memberIds],
      ),
      // Dernière exécution PAR (membre, routine) : `DISTINCT ON` plutôt qu'une
      // fenêtre tronquée — un digest journalier a jusqu'à 42 clés par membre,
      // et une simple limite de lignes en oublierait pour une équipe de taille
      // normale.
      this.dataSource.query<{ userId: string; routineKey: string; createdAt: Date | string; outcome: string }[]>(
        `SELECT DISTINCT ON (user_id, routine_key)
                user_id AS "userId", routine_key AS "routineKey", created_at AS "createdAt", outcome
         FROM routine_runs
         WHERE user_id = ANY($1)
         ORDER BY user_id, routine_key, created_at DESC`,
        [memberIds],
      ),
    ])

    const lastRunByKey = new Map<string, { createdAt: Date | string; outcome: string }>()
    for (const row of lastRunRows) lastRunByKey.set(`${row.userId}:${row.routineKey}`, row)

    const entriesByMember = new Map<string, ManagerRoutineMemberEntry[]>()
    const now = new Date()
    for (const row of subscriptionRows) {
      // Une clé retirée du catalogue depuis laisse une ligne orpheline que le
      // service PERSONNEL ignore déjà (`RoutineSubscriptionEntity`, docblock) —
      // même règle ici, jamais un nom de routine inventé.
      const definition = findRoutine(row.routineKey)
      if (!definition) continue

      const last = lastRunByKey.get(`${row.userId}:${row.routineKey}`)
      const entry: ManagerRoutineMemberEntry = {
        key: definition.key,
        name: definition.name,
        status: row.status,
        channel: row.channel,
        lastRunAt: last ? new Date(last.createdAt).toISOString() : null,
        // Même convention que `RoutinesService.list` (`lastFailed`) : `undefined`
        // sans exécution passée, jamais confondu avec `false` (GA-18/GA-19).
        lastFailed: last ? last.outcome.startsWith('Échec : ') : undefined,
        nextTriggerAt: nextRoutineTrigger(
          { enabled: row.status === 'active', hour: row.hour, weekday: row.weekday, timeZone: row.timeZone },
          definition.cadence,
          now,
        ),
      }
      const list = entriesByMember.get(row.userId)
      if (list) list.push(entry)
      else entriesByMember.set(row.userId, [entry])
    }

    return {
      members: members
        .map(m => ({ user_id: m.userId, routines: entriesByMember.get(m.userId) ?? [] }))
        .filter(m => m.routines.length > 0),
    }
  }

  private async workspaceName(workspaceId: string): Promise<string | null> {
    const rows = await this.dataSource.query<{ name: string }[]>(`SELECT name FROM workspaces WHERE id = $1`, [
      workspaceId,
    ])
    return rows[0]?.name ?? null
  }
}

/**
 * Plie les lignes « valeur × responsable » en segments de couverture.
 *
 * Deux précautions : (1) le regroupement est insensible à la casse — « Banque »
 * et « banque » sont la MÊME maille pour un manager, et deux lignes concurrentes
 * casseraient la lecture ; le libellé affiché est celui du segment le plus
 * lourd, jamais une reformulation. (2) On ne renvoie que le haut du classement
 * ({@link COVERAGE_SEGMENT_LIMIT}) : la longue traîne à 1 compte n'aide aucune
 * décision d'arbitrage.
 */
function toCoverageSegments(rows: CoverageRow[]): ManagerCoverageSegment[] {
  const byKey = new Map<string, { label: string; total: number; unassigned: number; owners: Map<string, number> }>()

  // Trié par volume décroissant AVANT le pliage : la première orthographe vue
  // pour une maille est donc celle qui pèse le plus.
  for (const row of [...rows].sort((a, b) => Number(b.count) - Number(a.count))) {
    const label = (row.label ?? '').trim()
    if (!label) continue
    const key = label.toLowerCase()
    const count = Number(row.count) || 0

    const segment = byKey.get(key) ?? { label, total: 0, unassigned: 0, owners: new Map<string, number>() }
    segment.total += count
    if (row.userId) {
      segment.owners.set(row.userId, (segment.owners.get(row.userId) ?? 0) + count)
    } else {
      segment.unassigned += count
    }
    byKey.set(key, segment)
  }

  return [...byKey.values()]
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label))
    .slice(0, COVERAGE_SEGMENT_LIMIT)
    .map(segment => ({
      label: segment.label,
      total: segment.total,
      unassigned: segment.unassigned,
      owners: [...segment.owners.entries()]
        .map(([user_id, count]) => ({ user_id, count }))
        .sort((a, b) => b.count - a.count),
    }))
}

function demoColleague(m: MemberRow) {
  return m.isDemo ? DEMO_COLLEAGUES.find(c => c.userId === m.userId) : undefined
}

function displayName(m: MemberRow): string {
  const full = [m.firstName, m.lastName].filter(Boolean).join(' ').trim()
  return full || m.email?.split('@')[0] || 'Membre'
}
