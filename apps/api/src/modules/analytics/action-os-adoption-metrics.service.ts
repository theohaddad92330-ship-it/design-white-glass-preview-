import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { computeActionOsAdoptionMetrics, type ActionOsAdoptionMetrics } from './action-os-adoption-metrics'

/** Même fenêtre par défaut que le reste de ce dossier (`manager-kpi.service.ts`). */
const DEFAULT_WINDOW_DAYS = 30

/**
 * #2442.13 (épopée #2879) — câble {@link computeActionOsAdoptionMetrics} sur
 * `approval_requests` et `workflow_runs`, tous deux du module `action-os` :
 * lecture SEULE, `Repository<WorkflowRunEntity>` injecté DIRECTEMENT (GA-07 ne
 * compte pas les repositories, `module-boundaries.spec.ts`), déclaré dans
 * `analytics.module.ts` (GA-20). `approval_requests` n'a pas de repository
 * propre à ce service : même patron que `manager-kpi.service.ts`, SQL brut via
 * `.manager.query` sur une table dont ce module n'est pas propriétaire.
 */
@Injectable()
export class ActionOsAdoptionMetricsService {
  constructor(
    @InjectRepository(WorkflowRunEntity)
    private readonly runs: Repository<WorkflowRunEntity>,
  ) {}

  private query<T = Record<string, unknown>>(sql: string, params: unknown[]): Promise<T[]> {
    return this.runs.manager.query(sql, params) as Promise<T[]>
  }

  async forWorkspace(
    workspaceId: string,
    windowDays: number = DEFAULT_WINDOW_DAYS,
    now: Date = new Date(),
  ): Promise<ActionOsAdoptionMetrics> {
    const since = new Date(now.getTime() - windowDays * 86_400_000)
    const [validatedRows, executedRows, disabledRows, firstSuccessRows] = await Promise.all([
      this.query<{ count: string }>(
        `-- q:action_os_validated
         SELECT COUNT(*)::text AS count
         FROM approval_requests
         WHERE workspace_id = $1 AND state = 'approved' AND decided_at >= $2 AND decided_at < $3`,
        [workspaceId, since, now],
      ),
      this.query<{ count: string }>(
        `-- q:action_os_executed
         SELECT COUNT(*)::text AS count
         FROM workflow_runs
         WHERE workspace_id = $1 AND status IN ('done', 'partial') AND created_at >= $2 AND created_at < $3`,
        [workspaceId, since, now],
      ),
      // #2442.13 (épopée #2879, lot R16) — « désactivation » : un intent
      // `toggle_routine` dispatché (`intents`, workflow-run.entity.ts:101-102)
      // avec `enabled: false`. `jsonb_each` parce qu'`intents` est une MAP (clé
      // = rang de la proposition), jamais un intent nu — un run peut en porter
      // plusieurs, un seul suffit à compter le run.
      this.query<{ count: string }>(
        `-- q:action_os_disabled
         SELECT COUNT(*)::text AS count
         FROM workflow_runs
         WHERE workspace_id = $1 AND status IN ('done', 'partial') AND created_at >= $2 AND created_at < $3
           AND EXISTS (
             SELECT 1 FROM jsonb_each(COALESCE(intents, '{}'::jsonb)) AS intent(key, value)
             WHERE intent.value->>'action' = 'toggle_routine' AND (intent.value->>'enabled') = 'false'
           )`,
        [workspaceId, since, now],
      ),
      this.query<{ first_success_at: string | null }>(
        `-- q:action_os_first_success
         SELECT MIN(created_at) AS first_success_at
         FROM workflow_runs
         WHERE workspace_id = $1 AND status = 'done'`,
        [workspaceId],
      ),
    ])
    return computeActionOsAdoptionMetrics({
      validated: Number(validatedRows[0]?.count ?? 0),
      executed: Number(executedRows[0]?.count ?? 0),
      disabled: Number(disabledRows[0]?.count ?? 0),
      firstSuccessAt: firstSuccessRows[0]?.first_success_at ?? null,
    })
  }
}
