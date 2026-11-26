import type { DataSource } from 'typeorm'
import type { BusinessUnitScopeClause } from '../accounts/business-unit-scope.clause'
import { accountRefScopeAnd, accountScopeAnd } from './manager-bu-scope'
import {
  LIVE_STAGES,
  hasPermission,
  needStillOpenSql,
  projectStageInSql,
  type ManagerActivityEvent,
  type ManagerPeriodActivity,
  type ManagerPeriodCount,
  type ManagerPipelineReview,
  type ManagerPipelineReviewReason,
  type ManagerPulse,
  type ManagerStaffing,
  type WorkspaceRole,
} from '@bellum/contracts'

/**
 * #4158.37-43 (lot L7, 14/10/2026) — les lectures de PÉRIODE du tableau `/team`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN FICHIER À PART, ET PAS UN `@Injectable`
 * ─────────────────────────────────────────────────────────────────────────────
 * `ManagerService` lit tout l'historique (« depuis toujours ») ; ce module ne lit
 * QUE la fenêtre choisie à l'écran (`?periode=7|30|90`) et sa précédente, de
 * même longueur. Deux questions différentes, deux fichiers. Une classe simple
 * construite par le service (et non un provider) : le module Nest n'a pas à
 * changer, et le cloisonnement reste celui du service — `workspaceId` vient
 * TOUJOURS de l'espace ACTIF de l'appelant, résolu et vérifié (`team:manage`)
 * AVANT qu'aucune de ces lectures ne parte.
 *
 * Chaque requête porte un marqueur `team-period:<clé>` (commentaire SQL) : il ne
 * change rien à l'exécution et permet aux tests de router sans dépendre d'un
 * fragment de SQL que d'autres requêtes contiennent aussi.
 *
 * Doctrine tenue ici : aucune probabilité, aucun montant pondéré, aucun
 * classement de personnes — des COMPTAGES et des RAISONS NOMMÉES.
 */

/** Une fenêtre `[since, now)` et sa précédente `[previousSince, since)`. */
type PeriodWindow = { days: number; since: Date; previousSince: Date }

export function periodWindow(days: number, now: Date = new Date()): PeriodWindow {
  const dayMs = 24 * 60 * 60 * 1000
  const since = new Date(now.getTime() - days * dayMs)
  return { days, since, previousSince: new Date(since.getTime() - days * dayMs) }
}

/**
 * #4158.41 — « sans activité » : même seuil que le portefeuille en veille du
 * service (`STALE_ACCOUNT_DAYS`, cadence J1/J3/J6/J9 dépassée). Recopié ici en
 * constante NOMMÉE et pas en nombre nu ; le service l'importe d'ici.
 */
export const PIPELINE_INACTIVITY_DAYS = 14

/**
 * #4158.41 — « bloquée dans son étape » : le MÊME seuil que le coaching
 * (#2405.6, `COACHING_STALE_OPPORTUNITY_DAYS`) — une opportunité dont le stade
 * n'a pas bougé depuis neuf jours. Un seul signal, une seule définition (GA-26).
 */
export const PIPELINE_STUCK_DAYS = 9

/** Tête de la revue de pipeline (le compteur complet voyage à part). */
const PIPELINE_REVIEW_LIMIT = 15

/** Tête du fil d'activité de la période (le total voyage à part). */
const PERIOD_ACTIVITY_LIMIT = 50

type CountRow = { current?: number | string | null; previous?: number | string | null }

const toCount = (row: CountRow | undefined): ManagerPeriodCount => ({
  current: Number(row?.current ?? 0) || 0,
  previous: Number(row?.previous ?? 0) || 0,
})

/** `current` / `previous` sur une colonne de date, fenêtre en `$2` / `$3`. */
const windowCounts = (column: string, expr = 'COUNT(*)') =>
  `${expr} FILTER (WHERE ${column} >= $2)::int AS "current",
   ${expr} FILTER (WHERE ${column} >= $3 AND ${column} < $2)::int AS "previous"`

export class ManagerPeriodReader {
  constructor(private readonly dataSource: DataSource) {}

  /** #4158.39 — les cinq indicateurs du pouls, période contre précédente. */
  async pulse(workspaceId: string, w: PeriodWindow, bu: BusinessUnitScopeClause = null): Promise<ManagerPulse> {
    const params = [workspaceId, w.since, w.previousSince]
    const [analyses, actionsDone, meetings, activeAccounts, openNeeds] = await Promise.all([
      this.dataSource.query<CountRow[]>(
        `/* team-period:pulse_analyses */
         SELECT ${windowCounts('created_at')} FROM analysis_runs WHERE workspace_id = $1 AND created_at >= $3${accountRefScopeAnd(bu, 'account_id')}`,
        params,
      ),
      // Une action du plan FAITE sur la période — sa date de complétion, jamais
      // sa date de création. L'espace se lit sur le compte (`action_plan_items`
      // ne porte pas de `workspace_id`).
      this.dataSource.query<CountRow[]>(
        `/* team-period:pulse_actions_done */
         SELECT ${windowCounts('i.completed_at')}
         FROM action_plan_items i JOIN accounts a ON a.id = i.account_id
         WHERE a.workspace_id = $1 AND i.completed_at >= $3${accountScopeAnd(bu, 'a.business_unit_id')}`,
        params,
      ),
      // « RDV obtenu » est un geste DÉCLARÉ par le commercial — l'écran le
      // nomme comme tel, jamais comme un rendez-vous vérifié.
      this.dataSource.query<CountRow[]>(
        `/* team-period:pulse_meetings */
         SELECT ${windowCounts('created_at')} FROM user_actions
         WHERE workspace_id = $1 AND action_type = 'rdv_obtained' AND created_at >= $3${accountRefScopeAnd(bu, 'account_id')}`,
        params,
      ),
      this.dataSource.query<CountRow[]>(
        `/* team-period:pulse_active_accounts */
         SELECT ${windowCounts('created_at', 'COUNT(DISTINCT account_id)')} FROM user_actions
         WHERE workspace_id = $1 AND account_id IS NOT NULL AND created_at >= $3${accountRefScopeAnd(bu, 'account_id')}`,
        params,
      ),
      this.dataSource.query<CountRow[]>(
        `/* team-period:pulse_open_needs */
         SELECT ${windowCounts('n.created_at')}
         FROM project_needs n JOIN accounts a ON a.id = n.account_id
         WHERE a.workspace_id = $1 AND n.created_at >= $3${accountScopeAnd(bu, 'a.business_unit_id')}`,
        params,
      ),
    ])
    return {
      analyses: toCount(analyses[0]),
      actions_done: toCount(actionsDone[0]),
      meetings_declared: toCount(meetings[0]),
      active_accounts: toCount(activeAccounts[0]),
      open_needs: toCount(openNeeds[0]),
    }
  }

  /**
   * #4158.40 — par membre : actions ouvertes qu'il PORTE (déléguées à lui,
   * sinon son propre plan — le porteur réel, comme l'agenda), dont en retard,
   * et son activité sur la période.
   */
  async memberPeriodStats(
    workspaceId: string,
    w: PeriodWindow,
    bu: BusinessUnitScopeClause = null,
  ): Promise<Map<string, { open: number; overdue: number; activity: number }>> {
    const [actions, activity] = await Promise.all([
      this.dataSource.query<{ userId: string; open: number; overdue: number }[]>(
        `/* team-period:member_actions */
         SELECT COALESCE(i.assigned_to, i.user_id) AS "userId",
                COUNT(*)::int AS "open",
                COUNT(*) FILTER (WHERE i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE)::int AS "overdue"
         FROM action_plan_items i JOIN accounts a ON a.id = i.account_id
         WHERE a.workspace_id = $1
           AND a.commercial_status <> 'archived'${accountScopeAnd(bu, 'a.business_unit_id')}
           AND i.done = false
           AND i.execution_status NOT IN ('done', 'obsolete')
           AND (i.snoozed_until IS NULL OR i.snoozed_until <= now())
         GROUP BY 1`,
        [workspaceId],
      ),
      this.dataSource.query<{ userId: string; count: number }[]>(
        `/* team-period:member_activity */
         SELECT user_id AS "userId", COUNT(*)::int AS "count"
         FROM user_actions WHERE workspace_id = $1 AND user_id IS NOT NULL AND created_at >= $2${accountRefScopeAnd(bu, 'account_id')}
         GROUP BY user_id`,
        [workspaceId, w.since],
      ),
    ])
    const out = new Map<string, { open: number; overdue: number; activity: number }>()
    const entry = (id: string) => out.get(id) ?? { open: 0, overdue: 0, activity: 0 }
    for (const row of actions) {
      if (!row?.userId) continue
      out.set(row.userId, { ...entry(row.userId), open: Number(row.open) || 0, overdue: Number(row.overdue) || 0 })
    }
    for (const row of activity) {
      if (!row?.userId) continue
      out.set(row.userId, { ...entry(row.userId), activity: Number(row.count) || 0 })
    }
    return out
  }

  /**
   * #4158.41 — « Revue de pipeline » : les affaires ENCORE EN JEU
   * (`LIVE_STAGES`, comme le pipeline valorisé) qui demandent un geste.
   *  - sans prochaine étape : aucune action ouverte sur le compte ;
   *  - sans activité : aucune trace d'équipe sur le compte depuis
   *    {@link PIPELINE_INACTIVITY_DAYS} jours ;
   *  - bloquée : stade inchangé depuis {@link PIPELINE_STUCK_DAYS} jours.
   * Tri : le plus de raisons d'abord, puis la plus ancienne dans son étape —
   * un ordre d'URGENCE sur des affaires, jamais un ordre sur des personnes.
   */
  async pipelineReview(workspaceId: string, bu: BusinessUnitScopeClause = null): Promise<ManagerPipelineReview> {
    const flagged = `WITH flagged AS (
         SELECT o.id AS "opportunityId", o.label, o.account_id AS "accountId", a.company_name AS "companyName",
                o.stage, a.assigned_to AS "ownerUserId", o.stage_entered_at AS "stageEnteredAt",
                act.last_at AS "lastActivityAt",
                NOT EXISTS (
                  SELECT 1 FROM action_plan_items i
                  WHERE i.account_id = a.id AND i.done = false AND i.execution_status NOT IN ('done', 'obsolete')
                ) AS "noNextStep",
                (act.last_at IS NULL OR act.last_at < now() - make_interval(days => $2)) AS "noActivity",
                (o.stage_entered_at < now() - make_interval(days => $3)) AS "stuck"
         FROM opportunities o
         JOIN accounts a ON a.id = o.account_id
         LEFT JOIN LATERAL (
           SELECT MAX(ua.created_at) AS last_at FROM user_actions ua
           WHERE ua.account_id = a.id AND ua.workspace_id = $1
         ) act ON TRUE
         WHERE a.workspace_id = $1
           AND a.status <> 'deleted'
           AND a.commercial_status <> 'archived'${accountScopeAnd(bu, 'a.business_unit_id')}
           AND o.archived_at IS NULL
           AND ${projectStageInSql('o.stage', LIVE_STAGES)}
       )`
    const anyReason = `("noNextStep" OR "noActivity" OR "stuck")`
    const [counts, rows] = await Promise.all([
      this.dataSource.query<{ total: number; noNextStep: number; noActivity: number; stuck: number }[]>(
        `/* team-period:pipeline_review_counts */
         ${flagged}
         SELECT COUNT(*) FILTER (WHERE ${anyReason})::int AS "total",
                COUNT(*) FILTER (WHERE "noNextStep")::int AS "noNextStep",
                COUNT(*) FILTER (WHERE "noActivity")::int AS "noActivity",
                COUNT(*) FILTER (WHERE "stuck")::int AS "stuck"
         FROM flagged`,
        [workspaceId, PIPELINE_INACTIVITY_DAYS, PIPELINE_STUCK_DAYS],
      ),
      this.dataSource.query<
        {
          opportunityId: string
          label: string
          accountId: string
          companyName: string
          stage: string
          ownerUserId: string | null
          stageEnteredAt: Date | string
          lastActivityAt: Date | string | null
          noNextStep: boolean
          noActivity: boolean
          stuck: boolean
        }[]
      >(
        `/* team-period:pipeline_review_items */
         ${flagged}
         SELECT * FROM flagged
         WHERE ${anyReason}
         ORDER BY ("noNextStep"::int + "noActivity"::int + "stuck"::int) DESC, "stageEnteredAt" ASC
         LIMIT $4`,
        [workspaceId, PIPELINE_INACTIVITY_DAYS, PIPELINE_STUCK_DAYS, PIPELINE_REVIEW_LIMIT],
      ),
    ])
    const c = counts[0]
    return {
      inactivity_days: PIPELINE_INACTIVITY_DAYS,
      stuck_days: PIPELINE_STUCK_DAYS,
      total: Number(c?.total ?? 0) || 0,
      counts: {
        no_next_step: Number(c?.noNextStep ?? 0) || 0,
        no_activity: Number(c?.noActivity ?? 0) || 0,
        stuck: Number(c?.stuck ?? 0) || 0,
      },
      items: rows
        .filter(r => r?.opportunityId)
        .map(r => {
          const reasons: ManagerPipelineReviewReason[] = []
          if (r.noNextStep) reasons.push('no_next_step')
          if (r.noActivity) reasons.push('no_activity')
          if (r.stuck) reasons.push('stuck')
          return {
            opportunity_id: r.opportunityId,
            label: r.label,
            account_id: r.accountId,
            company_name: r.companyName,
            stage: r.stage,
            owner_user_id: r.ownerUserId ?? null,
            reasons,
            stage_entered_at: new Date(r.stageEnteredAt).toISOString(),
            last_activity_at: r.lastActivityAt ? new Date(r.lastActivityAt).toISOString() : null,
          }
        }),
    }
  }

  /**
   * #4158.42 — besoins ouverts (la définition UNIQUE `needStillOpenSql`)
   * face aux consultants DÉCLARÉS disponibles. `inconnu` n'est jamais compté.
   */
  async staffing(workspaceId: string, bu: BusinessUnitScopeClause = null): Promise<ManagerStaffing> {
    const [needs, consultants] = await Promise.all([
      this.dataSource.query<{ open: number }[]>(
        `/* team-period:staffing_needs */
         SELECT COUNT(*)::int AS "open"
         FROM project_needs n JOIN accounts a ON a.id = n.account_id
         WHERE a.workspace_id = $1 AND ${needStillOpenSql('n.status')}${accountScopeAnd(bu, 'a.business_unit_id')}`,
        [workspaceId],
      ),
      this.dataSource.query<{ now: number; soon: number }[]>(
        `/* team-period:staffing_consultants */
         SELECT COUNT(*) FILTER (WHERE availability = 'immediate')::int AS "now",
                COUNT(*) FILTER (WHERE availability = 'sous_1_mois')::int AS "soon"
         FROM consultants WHERE workspace_id = $1 AND archived_at IS NULL`,
        [workspaceId],
      ),
    ])
    return {
      open_needs: Number(needs[0]?.open ?? 0) || 0,
      available_now: Number(consultants[0]?.now ?? 0) || 0,
      available_soon: Number(consultants[0]?.soon ?? 0) || 0,
    }
  }

  /** #4158 (complément BU) — invitations ENCORE VALABLES : une invitation périmée n'attend plus personne. */
  async pendingInvitations(workspaceId: string): Promise<number> {
    const rows = await this.dataSource.query<{ count: number }[]>(
      `/* team-period:pending_invitations */
       SELECT COUNT(*)::int AS "count" FROM workspace_invitations
       WHERE workspace_id = $1 AND status = 'pending' AND expires_at > now()`,
      [workspaceId],
    )
    return Number(rows[0]?.count ?? 0) || 0
  }

  /**
   * #4158 (complément BU) — les collègues qui ATTENDENT la description de l'ESN : aucune
   * fiche canonique dans l'espace, et un membre sans `team:manage` qui a déjà
   * commencé son onboarding (la règle de L3 #18). Un admin n'attend personne :
   * c'est lui qui décrit l'ESN.
   * Tranché sans Louis : « onboardé » = un `user_onboarding_state` qui n'est
   * plus `not_started`.
   */
  async awaitingEsnProfile(
    workspaceId: string,
    members: readonly { userId: string; role: WorkspaceRole }[],
  ): Promise<string[]> {
    const [canonical, started] = await Promise.all([
      this.dataSource.query<{ id: string }[]>(
        `/* team-period:esn_canonical */
         SELECT id FROM esn_profiles
         WHERE workspace_id = $1 AND is_workspace_canonical = true AND is_current = true LIMIT 1`,
        [workspaceId],
      ),
      this.dataSource.query<{ userId: string }[]>(
        `/* team-period:esn_waiting */
         SELECT m.user_id AS "userId"
         FROM workspace_members m JOIN user_onboarding_state s ON s.user_id = m.user_id
         WHERE m.workspace_id = $1 AND s.status <> 'not_started'`,
        [workspaceId],
      ),
    ])
    if (canonical.length > 0) return []
    const roleOf = new Map(members.map(m => [m.userId, m.role]))
    return started
      .map(row => row?.userId)
      .filter((id): id is string => {
        const role = id ? roleOf.get(id) : undefined
        return role !== undefined && !hasPermission(role, 'team:manage')
      })
  }

  /** #4158.43 — le fil de la période (`user_actions`), sa tête et son total. */
  async periodActivity(
    workspaceId: string,
    w: PeriodWindow,
    bu: BusinessUnitScopeClause = null,
  ): Promise<ManagerPeriodActivity> {
    const [total, rows] = await Promise.all([
      this.dataSource.query<{ total: number }[]>(
        `/* team-period:activity_total */
         SELECT COUNT(*)::int AS "total" FROM user_actions WHERE workspace_id = $1 AND created_at >= $2${accountRefScopeAnd(bu, 'account_id')}`,
        [workspaceId, w.since],
      ),
      this.dataSource.query<
        {
          id: string
          userId: string | null
          actionType: string
          accountId: string | null
          companyName: string | null
          createdAt: Date | string
        }[]
      >(
        `/* team-period:activity_items */
         SELECT ua.id, ua.user_id AS "userId", ua.action_type AS "actionType",
                ua.account_id AS "accountId", a.company_name AS "companyName", ua.created_at AS "createdAt"
         FROM user_actions ua LEFT JOIN accounts a ON a.id = ua.account_id
         WHERE ua.workspace_id = $1 AND ua.created_at >= $2${accountRefScopeAnd(bu, 'ua.account_id')}
         ORDER BY ua.created_at DESC
         LIMIT $3`,
        [workspaceId, w.since, PERIOD_ACTIVITY_LIMIT],
      ),
    ])
    const items: ManagerActivityEvent[] = rows
      .filter(r => r?.id && r.actionType)
      .map(r => ({
        id: r.id,
        user_id: r.userId,
        action_type: r.actionType,
        account_id: r.accountId,
        company_name: r.companyName,
        created_at: new Date(r.createdAt).toISOString(),
      }))
    return { total: Number(total[0]?.total ?? 0) || 0, items }
  }
}
