import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { LIVE_STAGES, projectStageInSql, type ManagerMember } from '@bellum/contracts'
import { calendarDate } from '../../database/calendar-date'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

function firstOfMonth(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-01`
}

const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))

/** Combien de comptes / actions / affaires la fiche embarque ; les compteurs voyagent à part. */
const MEMBER_SAMPLE_LIMIT = 50

/**
 * Théo D team-member.N1 — `GET /manager/members/:id`.
 *
 * LECTURE de ce qu'un collègue a enregistré : portefeuille, objectif du mois,
 * actions, affaires, intégrations. Décision Louis 22/10 (Q3) : TOUT membre
 * l'ouvre — pas de `team:manage` — mais JAMAIS la messagerie (c96) : aucune
 * requête ci-dessous ne touche une boîte, un fil ou un brouillon, et une garde
 * (le spec) le vérifie sur le SQL émis.
 *
 * Les intégrations sont nommées par CAPACITÉ (boîte Google, boîte Outlook,
 * CRM), jamais par fournisseur d'enrichissement.
 */
@Injectable()
export class ManagerMemberService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly workspaceContext: WorkspaceContextService,
  ) {}

  async getMember(callerId: string, memberId: string): Promise<ManagerMember> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(callerId)
    if (!(await this.workspaceContext.getMembership(memberId, workspaceId))) {
      throw new NotFoundException('Ce membre ne fait pas partie de cet espace.')
    }
    const period = firstOfMonth()
    const q = <T>(sql: string, params: unknown[]) => this.dataSource.query<T[]>(sql, params)

    const [profile, accounts, nextActions, actions, opps, signed, objective, proposals, integrations] =
      await Promise.all([
        q<{
          role: ManagerMember['member']['role']
          firstName: string | null
          lastName: string | null
          email: string | null
        }>(
          `SELECT m.role AS "role", p.first_name AS "firstName", p.last_name AS "lastName", p.email AS "email"
           FROM workspace_members m LEFT JOIN profiles p ON p.user_id = m.user_id
           WHERE m.workspace_id = $1 AND m.user_id = $2`,
          [workspaceId, memberId],
        ),
        q<{ id: string; companyName: string; sector: string | null; headquarters: string | null }>(
          `SELECT a.id, a.company_name AS "companyName", a.sector, a.headquarters
           FROM accounts a
           WHERE a.workspace_id = $1 AND a.assigned_to = $2 AND a.status <> 'deleted' AND a.commercial_status <> 'archived'
           ORDER BY a.company_name ASC LIMIT ${MEMBER_SAMPLE_LIMIT}`,
          [workspaceId, memberId],
        ),
        // La prochaine action ouverte de chaque compte du portefeuille.
        q<{ id: string; accountId: string; label: string; dueDate: Date | string | null }>(
          `SELECT DISTINCT ON (i.account_id) i.id, i.account_id AS "accountId", i.label, i.due_date AS "dueDate", true AS "nextAction"
           FROM action_plan_items i JOIN accounts a ON a.id = i.account_id
           WHERE a.workspace_id = $1 AND a.assigned_to = $2 AND i.done = false AND i.execution_status <> 'done'
             AND (i.snoozed_until IS NULL OR i.snoozed_until <= now())
           ORDER BY i.account_id, (i.due_date IS NULL), i.due_date ASC, i.created_at ASC`,
          [workspaceId, memberId],
        ),
        q<{
          id: string
          label: string
          accountId: string
          companyName: string
          dueDate: Date | string | null
          overdue: boolean
          delegatedBy: string | null
        }>(
          `SELECT i.id, i.label, i.account_id AS "accountId", a.company_name AS "companyName", i.due_date AS "dueDate",
                  (i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE) AS "overdue",
                  CASE WHEN i.assigned_to IS NOT NULL AND i.user_id <> i.assigned_to THEN i.user_id ELSE NULL END AS "delegatedBy"
           FROM action_plan_items i JOIN accounts a ON a.id = i.account_id
           WHERE a.workspace_id = $1 AND COALESCE(i.assigned_to, i.user_id) = $2
             AND i.done = false AND i.execution_status <> 'done'
             AND (i.snoozed_until IS NULL OR i.snoozed_until <= now())
           ORDER BY (i.due_date IS NULL), i.due_date ASC, i.created_at ASC LIMIT ${MEMBER_SAMPLE_LIMIT}`,
          [workspaceId, memberId],
        ),
        q<{ id: string; label: string; accountId: string; companyName: string; stage: string; amount: number | null }>(
          `SELECT o.id, o.label, o.account_id AS "accountId", a.company_name AS "companyName", o.stage, o.estimated_amount::float8 AS "amount"
           FROM opportunities o JOIN accounts a ON a.id = o.account_id
           WHERE a.workspace_id = $1 AND a.assigned_to = $2 AND a.commercial_status <> 'archived'
             AND ${projectStageInSql('o.stage', LIVE_STAGES)}
           ORDER BY o.estimated_amount DESC NULLS LAST LIMIT ${MEMBER_SAMPLE_LIMIT}`,
          [workspaceId, memberId],
        ),
        q<{ amount: number | null; valued: number }>(
          `SELECT SUM(o.estimated_amount)::float8 AS "amount", COUNT(o.estimated_amount)::int AS "valued"
           FROM opportunities o JOIN accounts a ON a.id = o.account_id
           WHERE a.workspace_id = $1 AND a.assigned_to = $2 AND o.stage = 'won'
             AND o.updated_at >= $3::date AND o.updated_at < ($3::date + interval '1 month')`,
          [workspaceId, memberId, period],
        ),
        q<{ target_revenue: string | null; target_meetings: number | null; target_accounts: number | null }>(
          `SELECT target_revenue, target_meetings, target_accounts FROM member_objectives
           WHERE workspace_id = $1 AND user_id = $2 AND period_month = $3::date`,
          [workspaceId, memberId, period],
        ),
        q<{ count: number }>(
          `SELECT COUNT(*)::int AS "count" FROM objective_proposals
           WHERE workspace_id = $1 AND user_id = $2 AND status = 'proposed' AND period_month = $3::date`,
          [workspaceId, memberId, period],
        ),
        q<{ kind: ManagerMember['integrations'][number]['kind']; connectedByMember: boolean }>(
          `SELECT 'mailbox' AS "kind", (user_id = $2) AS "connectedByMember" FROM google_connections WHERE workspace_id = $1
           UNION ALL
           SELECT 'mailbox', (user_id = $2) FROM microsoft_connections WHERE workspace_id = $1
           UNION ALL
           SELECT 'crm', (user_id = $2) FROM crm_connections WHERE workspace_id = $1`,
          [workspaceId, memberId],
        ),
      ])

    const row = profile[0]
    const nextByAccount = new Map(nextActions.map(a => [a.accountId, a]))
    const name = [row?.firstName, row?.lastName].filter(Boolean).join(' ').trim()
    const target = objective[0]
    return {
      member: {
        user_id: memberId,
        name: name || row?.email || memberId,
        email: row?.email ?? '',
        role: row?.role ?? 'member',
      },
      period_month: period,
      counts: { accounts: accounts.length, open_opportunities: opps.length, open_actions: actions.length },
      objective: {
        target_revenue: numOrNull(target?.target_revenue),
        target_meetings: numOrNull(target?.target_meetings),
        target_accounts: numOrNull(target?.target_accounts),
        // Aucun montant saisi sur les affaires gagnées = non mesuré, jamais 0 (GA-18/GA-19).
        signed_amount: Number(signed[0]?.valued ?? 0) > 0 ? numOrNull(signed[0]?.amount) : null,
        pending_proposal: Number(proposals[0]?.count ?? 0) > 0,
      },
      accounts: accounts.map(a => {
        const next = nextByAccount.get(a.id)
        return {
          id: a.id,
          company_name: a.companyName,
          sector: a.sector,
          city: a.headquarters,
          next_action: next ? { id: next.id, label: next.label, due_date: calendarDate(next.dueDate) } : null,
        }
      }),
      actions: actions.map(a => ({
        id: a.id,
        label: a.label,
        account_id: a.accountId,
        company_name: a.companyName,
        due_date: calendarDate(a.dueDate),
        overdue: a.overdue === true,
        delegated_by: a.delegatedBy,
      })),
      opportunities: opps.map(o => ({
        id: o.id,
        label: o.label,
        account_id: o.accountId,
        company_name: o.companyName,
        stage: o.stage,
        estimated_amount: numOrNull(o.amount),
      })),
      integrations: integrations.map(i => ({ kind: i.kind, connected_by_member: i.connectedByMember === true })),
    }
  }
}
