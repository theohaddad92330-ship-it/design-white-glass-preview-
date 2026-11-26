import { ForbiddenException, Injectable, Optional } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { can, LIVE_STAGES, projectStageInSql } from '@bellum/contracts'
import type { ManagerTeamBusiness, ManagerTeamPlans } from '@bellum/contracts'
import { calendarDate } from '../../database/calendar-date'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { resolveBusinessUnitScope } from '../business-unit/resolve-business-unit-scope'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { accountScopeAnd } from './manager-bu-scope'

function firstOfMonth(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}

const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

/** Ce que les écrans « Objectifs & affaires » et « Plans & actions » embarquent ; les totaux voyagent à part. */
const DEALS_LIMIT = 100
const ACCOUNTS_LIMIT = 100
const ACTIONS_LIMIT = 200

type MemberRow = {
  userId: string
  role: string
  firstName: string | null
  lastName: string | null
  email: string | null
}

/**
 * Théo D team-business + team-plans — les lectures de la direction.
 *
 * `GET /manager/team-business` : le cap du mois, la cible et le réalisé de CHAQUE
 * membre, TOUTES les affaires ouvertes (avec la date de décision visée) et le
 * portefeuille de comptes avec leur responsable. `GET /manager/team-plans` : les
 * actions ouvertes de l'équipe, avec qui les a confiées.
 *
 * Réservé à ceux qui encadrent une équipe (`team:manage`, comme `team-stats`),
 * borné au périmètre BU de l'appelant (fail-closed). Aucune lecture de messagerie
 * (c96) ; aucune probabilité de signature (doctrine) ; un montant absent n'est
 * jamais 0.
 */
@Injectable()
export class ManagerTeamViewsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly workspaceContext: WorkspaceContextService,
    @Optional() private readonly businessUnits?: BusinessUnitService,
  ) {}

  private async assertManager(userId: string): Promise<string> {
    const { workspaceId, role } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const extra = await this.workspaceContext.extraPermissionsOf(workspaceId, userId)
    if (!can(role, extra, 'team:manage')) {
      throw new ForbiddenException('Vue réservée à ceux qui encadrent une équipe.')
    }
    return workspaceId
  }

  private listMembers(workspaceId: string): Promise<MemberRow[]> {
    return this.dataSource.query<MemberRow[]>(
      `SELECT m.user_id AS "userId", m.role AS "role", p.first_name AS "firstName", p.last_name AS "lastName", p.email AS "email"
       FROM workspace_members m LEFT JOIN profiles p ON p.user_id = m.user_id
       WHERE m.workspace_id = $1`,
      [workspaceId],
    )
  }

  private nameOf(m: MemberRow): string {
    return [m.firstName, m.lastName].filter(Boolean).join(' ').trim() || m.email || m.userId
  }

  async getBusiness(userId: string, month?: string): Promise<ManagerTeamBusiness> {
    const workspaceId = await this.assertManager(userId)
    const bu = await resolveBusinessUnitScope(this.businessUnits, workspaceId, userId)
    const period = month ?? firstOfMonth()
    const scope = accountScopeAnd(bu, 'a.business_unit_id')
    const q = <T>(sql: string, params: unknown[]) => this.dataSource.query<T[]>(sql, params)

    const [members, objectives, won, meetings, newAccounts, proposals, deals, nextActions, accounts] =
      await Promise.all([
        this.listMembers(workspaceId),
        q<{ userId: string; rev: string | null; meet: number | null; acc: number | null }>(
          `SELECT user_id AS "userId", target_revenue AS "rev", target_meetings AS "meet", target_accounts AS "acc", true AS "objectiveRow"
           FROM member_objectives WHERE workspace_id = $1 AND period_month = $2::date`,
          [workspaceId, period],
        ),
        q<{ userId: string; amount: number | null; valued: number; total: number }>(
          `SELECT a.assigned_to AS "userId", SUM(o.estimated_amount)::float8 AS "amount", COUNT(o.estimated_amount)::int AS "valued",
                  COUNT(*)::int AS "total", true AS "wonRow"
           FROM opportunities o JOIN accounts a ON a.id = o.account_id
           WHERE a.workspace_id = $1 AND a.assigned_to IS NOT NULL AND a.status <> 'deleted' AND o.stage = 'won'${scope}
             AND o.updated_at >= $2::date AND o.updated_at < ($2::date + interval '1 month')
           GROUP BY a.assigned_to`,
          [workspaceId, period],
        ),
        q<{ userId: string; count: number }>(
          `SELECT user_id AS "userId", COUNT(*)::int AS "count" FROM user_actions
           WHERE workspace_id = $1 AND user_id IS NOT NULL AND action_type = 'rdv_obtained'
             AND created_at >= $2::date AND created_at < ($2::date + interval '1 month')
           GROUP BY user_id`,
          [workspaceId, period],
        ),
        q<{ userId: string; count: number }>(
          `SELECT a.user_id AS "userId", COUNT(*)::int AS "count", true AS "newAccountsRow"
           FROM accounts a WHERE a.workspace_id = $1 AND a.user_id IS NOT NULL AND a.status <> 'deleted'${scope}
             AND a.created_at >= $2::date AND a.created_at < ($2::date + interval '1 month')
           GROUP BY a.user_id`,
          [workspaceId, period],
        ),
        q<{ userId: string }>(
          `SELECT DISTINCT user_id AS "userId" FROM objective_proposals
           WHERE workspace_id = $1 AND status = 'proposed' AND period_month = $2::date`,
          [workspaceId, period],
        ),
        q<{
          id: string
          label: string
          accountId: string
          companyName: string
          ownerId: string | null
          stage: string
          amount: number | null
          closeOn: Date | string | null
          nextAction: string | null
        }>(
          `SELECT o.id, o.label, o.account_id AS "accountId", a.company_name AS "companyName",
                  COALESCE(o.owner_id, a.assigned_to) AS "ownerId", o.stage, o.estimated_amount::float8 AS "amount",
                  o.expected_close_on AS "closeOn",
                  (SELECT i.label FROM action_plan_items i
                    WHERE i.account_id = a.id AND i.done = false AND i.execution_status <> 'done'
                    ORDER BY (i.due_date IS NULL), i.due_date ASC, i.created_at ASC LIMIT 1) AS "nextAction",
                  true AS "dealRow"
           FROM opportunities o JOIN accounts a ON a.id = o.account_id
           WHERE a.workspace_id = $1 AND a.status <> 'deleted' AND a.commercial_status <> 'archived'${scope}
             AND ${projectStageInSql('o.stage', LIVE_STAGES)}
           ORDER BY o.estimated_amount DESC NULLS LAST, o.label ASC LIMIT ${DEALS_LIMIT}`,
          [workspaceId],
        ),
        q<{ id: string; accountId: string; label: string; dueDate: Date | string | null }>(
          `SELECT DISTINCT ON (i.account_id) i.id, i.account_id AS "accountId", i.label, i.due_date AS "dueDate", true AS "nextActionRow"
           FROM action_plan_items i JOIN accounts a ON a.id = i.account_id
           WHERE a.workspace_id = $1 AND a.status <> 'deleted' AND a.commercial_status <> 'archived'${scope}
             AND i.done = false AND i.execution_status <> 'done'
             AND (i.snoozed_until IS NULL OR i.snoozed_until <= now())
           ORDER BY i.account_id, (i.due_date IS NULL), i.due_date ASC, i.created_at ASC`,
          [workspaceId],
        ),
        q<{
          id: string
          companyName: string
          sector: string | null
          headquarters: string | null
          assignedTo: string | null
          total: number
        }>(
          `SELECT a.id, a.company_name AS "companyName", a.sector, a.headquarters, a.assigned_to AS "assignedTo",
                  COUNT(*) OVER ()::int AS "total", true AS "portfolioRow"
           FROM accounts a
           WHERE a.workspace_id = $1 AND a.status <> 'deleted' AND a.commercial_status <> 'archived'${scope}
           ORDER BY (a.assigned_to IS NULL) DESC, a.company_name ASC LIMIT ${ACCOUNTS_LIMIT}`,
          [workspaceId],
        ),
      ])

    const objByUser = new Map(objectives.map(o => [o.userId, o]))
    const wonByUser = new Map(won.map(w => [w.userId, w]))
    const meetingsByUser = new Map(meetings.map(m => [m.userId, Number(m.count)]))
    const accountsByUser = new Map(newAccounts.map(m => [m.userId, Number(m.count)]))
    const proposed = new Set(proposals.map(p => p.userId))
    const nextByAccount = new Map(nextActions.map(a => [a.accountId, a]))

    const memberRows = members.map(m => {
      const obj = objByUser.get(m.userId)
      const w = wonByUser.get(m.userId)
      return {
        user_id: m.userId,
        name: this.nameOf(m),
        role: m.role as ManagerTeamBusiness['members'][number]['role'],
        // Aucun montant saisi sur ses affaires gagnées = non mesuré, jamais 0.
        signed_amount: w && Number(w.valued) > 0 ? numOrNull(w.amount) : null,
        target_revenue: numOrNull(obj?.rev),
        target_meetings: numOrNull(obj?.meet),
        achieved_meetings: meetingsByUser.get(m.userId) ?? 0,
        target_accounts: numOrNull(obj?.acc),
        achieved_accounts: accountsByUser.get(m.userId) ?? 0,
        pending_proposal: proposed.has(m.userId),
      }
    })

    const withTarget = memberRows.filter(m => m.target_revenue !== null)
    const signedRows = memberRows.filter(m => m.signed_amount !== null)
    const valuedDeals = deals.filter(d => d.amount !== null)
    return {
      period_month: period,
      cap: {
        signed_amount: signedRows.length > 0 ? signedRows.reduce((s, m) => s + (m.signed_amount ?? 0), 0) : null,
        target_amount: withTarget.length > 0 ? withTarget.reduce((s, m) => s + (m.target_revenue ?? 0), 0) : null,
        contributors_with_target: withTarget.length,
        members_total: memberRows.length,
        won_without_amount: won.reduce((s, w) => s + (Number(w.total) - Number(w.valued)), 0),
      },
      members: memberRows,
      deals: deals.map(d => ({
        opportunity_id: d.id,
        label: d.label,
        account_id: d.accountId,
        company_name: d.companyName,
        owner_user_id: d.ownerId,
        stage: d.stage,
        estimated_amount: numOrNull(d.amount),
        expected_close_on: calendarDate(d.closeOn),
        next_action_label: d.nextAction,
      })),
      deals_total: deals.length,
      deals_amount: valuedDeals.length > 0 ? valuedDeals.reduce((s, d) => s + Number(d.amount), 0) : null,
      deals_without_amount: deals.length - valuedDeals.length,
      accounts: accounts.map(a => {
        const next = nextByAccount.get(a.id)
        return {
          id: a.id,
          company_name: a.companyName,
          sector: a.sector,
          city: a.headquarters,
          assigned_to: a.assignedTo,
          next_action: next ? { id: next.id, label: next.label, due_date: calendarDate(next.dueDate) } : null,
        }
      }),
      accounts_total: Number(accounts[0]?.total ?? 0),
    }
  }

  async getPlans(userId: string): Promise<ManagerTeamPlans> {
    const workspaceId = await this.assertManager(userId)
    const bu = await resolveBusinessUnitScope(this.businessUnits, workspaceId, userId)
    const scope = accountScopeAnd(bu, 'a.business_unit_id')
    const OPEN = `FROM action_plan_items i JOIN accounts a ON a.id = i.account_id
       WHERE a.workspace_id = $1 AND a.commercial_status <> 'archived'${scope}
         AND i.done = false AND i.execution_status <> 'done'
         AND (i.snoozed_until IS NULL OR i.snoozed_until <= now())`
    const [counts, rows, members, accounts] = await Promise.all([
      this.dataSource.query<{ open: number; overdue: number; delegated: number }[]>(
        `SELECT COUNT(*)::int AS "open",
                COUNT(*) FILTER (WHERE i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE)::int AS "overdue",
                COUNT(*) FILTER (WHERE i.assigned_to IS NOT NULL)::int AS "delegated", true AS "planCounts"
         ${OPEN}`,
        [workspaceId],
      ),
      this.dataSource.query<
        {
          id: string
          label: string
          accountId: string
          companyName: string
          dueDate: Date | string | null
          overdue: boolean
          ownerUserId: string
          assignedTo: string | null
          delegatedBy: string | null
        }[]
      >(
        `SELECT i.id, i.label, i.account_id AS "accountId", a.company_name AS "companyName", i.due_date AS "dueDate",
                (i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS "overdue",
                i.user_id AS "ownerUserId", i.assigned_to AS "assignedTo",
                CASE WHEN i.assigned_to IS NOT NULL AND i.user_id <> i.assigned_to THEN i.user_id ELSE NULL END AS "delegatedBy",
                true AS "planRow"
         ${OPEN}
         ORDER BY (i.due_date IS NULL), i.due_date ASC, i.created_at ASC LIMIT ${ACTIONS_LIMIT}`,
        [workspaceId],
      ),
      this.listMembers(workspaceId),
      this.dataSource.query<{ id: string; companyName: string }[]>(
        `SELECT a.id, a.company_name AS "companyName" FROM accounts a
         WHERE a.workspace_id = $1 AND a.status <> 'deleted' AND a.commercial_status <> 'archived'${scope}
         ORDER BY a.company_name ASC LIMIT ${ACCOUNTS_LIMIT}`,
        [workspaceId],
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
        due_date: calendarDate(r.dueDate),
        overdue: r.overdue === true,
        owner_user_id: r.ownerUserId,
        assigned_to: r.assignedTo,
        delegated_by: r.delegatedBy,
      })),
      members: members.map(m => ({ user_id: m.userId, name: this.nameOf(m) })),
      accounts: accounts.map(a => ({ id: a.id, company_name: a.companyName })),
    }
  }
}
