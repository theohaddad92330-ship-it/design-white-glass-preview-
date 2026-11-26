import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import {
  PIPELINE_DETECTION_TO_REVIEW_SQL,
  RUNNING_MISSION_STATUSES,
  UNASSIGNED_MISSIONS_SQL,
  financeScopeClause,
  measuredCounter,
  OPPORTUNITIES_ACTIVE_FROM_SQL,
  OPPORTUNITIES_IN_WORKSPACE_SQL,
  needStillOpenSql,
  pipelineSummary,
  securedMonthlyRevenueOf,
  type CrmCountersResponse,
  type FinanceScope,
  type HorizonForecast,
} from '@bellum/contracts'
import { MissionEntity } from '../../database/entities/mission.entity'

/**
 * #4193 (épopée #4191, lot L2) — LES COMPTEURS CRM : une définition écrite, une
 * seule source.
 *
 * Ce service ne recompte pas à sa façon : il RÉUTILISE `pipelineSummary()` (pur,
 * celui de `GET /projects/pipeline`) pour les affaires, `NEED_OPEN_STATUSES`
 * (via `needStillOpenSql`) pour les besoins et `RUNNING_MISSION_STATUSES` pour
 * les missions. Les écrans lisent ces nombres, ils ne refont plus de
 * `.filter(...).length`.
 *
 * ⚠️ GA-07 : aucun import de service d'un autre module. Le prévisionnel du mois
 * (dont le revenu sécurisé est tiré) est LU par le contrôleur, qui le passe ici.
 *
 * ⚠️ PORTÉE : `own` restreint les affaires et les missions (seules portent un
 * propriétaire commercial) ; les besoins et les candidatures sont ceux de
 * l'équipe, sans propriétaire inventé pour les besoins d'un filtre.
 */
const DAY_MS = 86_400_000

const RUNNING_SQL = RUNNING_MISSION_STATUSES.map(status => `'${status}'`).join(', ')

type OpportunityRow = Parameters<typeof pipelineSummary>[0][number]

@Injectable()
export class CrmCountersService {
  constructor(@InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>) {}

  async compute(scope: FinanceScope, now: Date = new Date(), forecast?: HorizonForecast): Promise<CrmCountersResponse> {
    const query = <T>(sql: string, params: unknown[]) => this.missions.manager.query<T>(sql, params)
    const workspaceId = scope.workspaceId
    const own = scope.kind === 'own'

    const oppScope = financeScopeClause(scope, 'o', 2)
    const missionScope = financeScopeClause(scope, 'm', 2)

    const [opportunities, needs, pistes, submissions, missionRows, outside] = await Promise.all([
      query<OpportunityRow[]>(
        `SELECT o.stage, o.kind, o.amount_cents::int AS amount_cents,
                o.source, o.owner_id, o.expected_close_on::text AS expected_close_on, o.btmmp,
                o.objective, o.risks, o.scope_label
           ${OPPORTUNITIES_ACTIVE_FROM_SQL}
          WHERE ${OPPORTUNITIES_IN_WORKSPACE_SQL}${oppScope.sql}`,
        [workspaceId, ...oppScope.params],
      ),
      query<{ open: string }[]>(
        `SELECT COUNT(*) FILTER (WHERE ${needStillOpenSql('n.status')})::text AS open
           FROM project_needs n
          WHERE n.workspace_id = $1 AND n.archived_at IS NULL`,
        [workspaceId],
      ),
      // #4191 (recette 3, F1) — LA piste : le prédicat de la liste Pistes (`listDetected`), pas un recomptage.
      query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count FROM pipeline_detections d WHERE ${PIPELINE_DETECTION_TO_REVIEW_SQL}`,
        [workspaceId],
      ),
      query<{ count: string }[]>(
        `SELECT COUNT(*)::text AS count
           FROM submissions s
          WHERE s.workspace_id = $1 AND s.stage IN ('submitted', 'interview')`,
        [workspaceId],
      ),
      query<{ status: string; ends_on: string | Date | null }[]>(
        `SELECT m.status, m.ends_on
           FROM missions m
          WHERE m.workspace_id = $1 AND m.status IN (${RUNNING_SQL})${missionScope.sql}`,
        [workspaceId, ...missionScope.params],
      ),
      own ? query<{ count: string }[]>(UNASSIGNED_MISSIONS_SQL, [workspaceId]) : Promise.resolve(null),
    ])

    const summary = pipelineSummary(opportunities)
    const running = missionRows.filter(row => (RUNNING_MISSION_STATUSES as readonly string[]).includes(row.status))
    const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`)
    const endingWithin = (days: number) =>
      running.filter(row => {
        if (!row.ends_on) return false
        const end = Date.parse(
          `${String(row.ends_on instanceof Date ? row.ends_on.toISOString() : row.ends_on).slice(0, 10)}T00:00:00Z`,
        )
        return end >= today && end <= today + days * DAY_MS
      }).length

    const amounts = securedMonthlyRevenueOf(forecast)

    return {
      scope: { kind: scope.kind, outsideAnyPortfolio: outside ? Number(outside[0]?.count ?? 0) : null },
      counters: {
        opportunities_active: measuredCounter(summary.total_count, 'opportunities_active'),
        leads_to_qualify: measuredCounter(summary.intake, 'leads_to_qualify'),
        buying_signals: measuredCounter(summary.signals, 'buying_signals'),
        generic_deductions: measuredCounter(summary.generic_deductions ?? 0, 'generic_deductions'),
        pistes_to_review: measuredCounter(Number(pistes[0]?.count ?? 0), 'pistes_to_review'),
        needs_open: measuredCounter(Number(needs[0]?.open ?? 0), 'needs_open'),
        submissions_in_progress: measuredCounter(Number(submissions[0]?.count ?? 0), 'submissions_in_progress'),
        missions_active: measuredCounter(running.length, 'missions_active'),
        missions_ending_30: measuredCounter(endingWithin(30), 'missions_ending_30'),
        missions_ending_60: measuredCounter(endingWithin(60), 'missions_ending_60'),
        missions_ending_90: measuredCounter(endingWithin(90), 'missions_ending_90'),
      },
      secured_revenue_month: {
        measured: amounts !== undefined,
        amounts: amounts ?? null,
        definition_key: 'secured_revenue_month',
      },
    }
  }
}
