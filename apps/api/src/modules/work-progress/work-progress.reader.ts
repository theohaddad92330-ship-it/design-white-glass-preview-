import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm'
import {
  LAURA_JOB_DEFINITION_KEY,
  WORK_FAILURES_PER_FAMILY,
  type WorkCounter,
  type WorkFailure,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { AnalysisBatchEntity } from '../../database/entities/analysis-batch.entity'
import { AnalysisBatchItemEntity } from '../../database/entities/analysis-batch-item.entity'
import { IntegrationSyncRunEntity } from '../../database/entities/integration-sync-run.entity'
import { OrgEnrichmentJobEntity } from '../../database/entities/org-enrichment-job.entity'
import { UniversalImportJobEntity } from '../../database/entities/universal-import-job.entity'
import { WorkflowRunEntity } from '../../database/entities/workflow-run.entity'
import { businessUnitScopeClause } from '../accounts/business-unit-scope.clause'
import type { AnalysisLotRef, FamilyMeasures, WorkProgressReader, WorkQuery } from './work-progress.service'

/**
 * #4611.4 — LES ÉTATS QUE CHAQUE COMPTEUR COMPTE, écrits une fois. Chacun a SA requête : « en cours »
 * n'est jamais « lancées − rendues ». Un état hors de ces listes (annulé, à confirmer…) n'est compté nulle
 * part plutôt que rangé d'office dans un autre compteur.
 */
const ANALYSIS_DONE = ['done'] as const
/** `partial` = arrêtée APRÈS avoir livré des phases : un arrêt en erreur, sa raison manque parfois (nommée telle). */
const ANALYSIS_FAILED = ['failed', 'partial'] as const
const ANALYSIS_RUNNING = ['queued', 'running'] as const
const IMPORT_RUNNING = ['queued', 'processing'] as const
const ENRICHMENT_DONE = ['completed'] as const
const ENRICHMENT_FAILED = ['failed', 'partial'] as const
const ENRICHMENT_RUNNING = ['pending', 'running'] as const
const SYNC_DONE = ['completed'] as const
const SYNC_FAILED = ['failed'] as const
/** Les états VIVANTS d'une synchro (`SYNC_RUN_STATUSES` moins les terminaux) — `partial` est réservé, jamais écrit. */
const SYNC_RUNNING = [
  'pending',
  'running',
  'reading_sources',
  'matching_accounts',
  'matching_contacts',
  'detecting_events',
  'preparing_summary',
] as const
/**
 * Lot L6 — les états d'un job de Laura (`lauraJobStateOf`). Pas encore lancé : brouillon, à confirmer,
 * reporté. `partial`, `cancelled`, `superseded`, `unknown` sont lancés sans être ni rendus, ni en
 * erreur, ni en cours : ils ne comptent que dans « lancés » (rien n'est déduit des autres).
 */
const LAURA_JOB_NOT_LAUNCHED = ['draft', 'to_confirm', 'snoozed'] as const
const LAURA_JOB_DONE = ['done'] as const
const LAURA_JOB_FAILED = ['failed'] as const
const LAURA_JOB_RUNNING = ['planned', 'running', 'awaiting_approval', 'blocked'] as const

type Counted = { counter: WorkCounter; count: () => Promise<number> }

@Injectable()
export class TypeormWorkProgressReader implements WorkProgressReader {
  private readonly logger = new Logger(TypeormWorkProgressReader.name)

  constructor(
    @InjectRepository(AnalysisBatchEntity) private readonly batches: Repository<AnalysisBatchEntity>,
    @InjectRepository(AnalysisBatchItemEntity) private readonly items: Repository<AnalysisBatchItemEntity>,
    @InjectRepository(UniversalImportJobEntity) private readonly importJobs: Repository<UniversalImportJobEntity>,
    @InjectRepository(OrgEnrichmentJobEntity) private readonly enrichmentJobs: Repository<OrgEnrichmentJobEntity>,
    @InjectRepository(IntegrationSyncRunEntity) private readonly syncRuns: Repository<IntegrationSyncRunEntity>,
    @InjectRepository(WorkflowRunEntity) private readonly runs: Repository<WorkflowRunEntity>,
  ) {}

  async findAnalysisLot(lotId: string): Promise<AnalysisLotRef | null> {
    // Cherché par le SEUL identifiant, sans chiffre : c'est le service qui refuse un lot hors périmètre.
    if (!/^[0-9a-f-]{36}$/i.test(lotId)) return null
    const batch = await this.batches.findOne({ where: { id: lotId } })
    if (!batch) return null
    const rows = await this.items
      .createQueryBuilder('i')
      .leftJoin(AccountEntity, 'a', 'a.id = i.account_id')
      .select('a.business_unit_id', 'business_unit_id')
      .where('i.batch_id = :lotId', { lotId })
      .getRawMany<{ business_unit_id: string | null }>()
    return {
      id: batch.id,
      workspaceId: batch.workspace_id,
      itemBusinessUnitIds: rows.map(row => row.business_unit_id ?? null),
    }
  }

  async analysis(query: WorkQuery): Promise<FamilyMeasures> {
    const base = (): SelectQueryBuilder<AnalysisBatchItemEntity> => {
      const qb = this.items
        .createQueryBuilder('i')
        .innerJoin(AnalysisBatchEntity, 'b', 'b.id = i.batch_id')
        .leftJoin(AccountEntity, 'a', 'a.id = i.account_id')
        .where('i.workspace_id = :workspaceId AND b.workspace_id = :workspaceId', { workspaceId: query.workspaceId })
      if (query.lotId) qb.andWhere('b.id = :lotId', { lotId: query.lotId })
      else qb.andWhere('b.created_at >= :since', { since: query.since })
      const clause = businessUnitScopeClause(query.businessUnitScope, 'a.business_unit_id', ':...businessUnitIds')
      if (clause) qb.andWhere(clause, { businessUnitIds: query.businessUnitScope?.businessUnitIds ?? [] })
      return qb
    }
    const measures = await this.countEach([
      { counter: 'launched', count: () => base().andWhere('i.account_id IS NOT NULL').getCount() },
      { counter: 'done', count: () => base().andWhere('i.state IN (:...s)', { s: ANALYSIS_DONE }).getCount() },
      { counter: 'failed', count: () => base().andWhere('i.state IN (:...s)', { s: ANALYSIS_FAILED }).getCount() },
      { counter: 'running', count: () => base().andWhere('i.state IN (:...s)', { s: ANALYSIS_RUNNING }).getCount() },
    ])
    const bounds = await this.bounds(
      base().select('MIN(b.created_at)', 'since').addSelect('MAX(i.updated_at)', 'last'),
      'analysis',
    )
    const failed = await this.failures(
      base()
        .andWhere('i.state IN (:...s)', { s: ANALYSIS_FAILED })
        .select(['i.name AS label', 'i.failure_code AS reason', 'i.updated_at AS at'])
        .orderBy('i.updated_at', 'DESC')
        .limit(WORK_FAILURES_PER_FAMILY),
      'analysis',
    )
    return { measures, ...bounds, failures: failed }
  }

  async imports(query: WorkQuery): Promise<FamilyMeasures> {
    const base = (): SelectQueryBuilder<UniversalImportJobEntity> =>
      this.importJobs
        .createQueryBuilder('j')
        .where('j.workspace_id = :workspaceId', { workspaceId: query.workspaceId })
        .andWhere('j.created_at >= :since', { since: query.since })
        // Un import « personnel » n'est lisible que de son auteur (#2927) — même règle ici que sur l'écran.
        .andWhere("(j.scope = 'workspace' OR j.user_id = :userId)", { userId: query.userId })
        // Un fichier encore en envoi n'est pas du travail LANCÉ.
        .andWhere("j.status <> 'uploading'")
    const measures = await this.countEach([
      { counter: 'launched', count: () => base().getCount() },
      { counter: 'done', count: () => base().andWhere("j.status = 'done'").getCount() },
      { counter: 'failed', count: () => base().andWhere("j.status = 'failed'").getCount() },
      { counter: 'running', count: () => base().andWhere('j.status IN (:...s)', { s: IMPORT_RUNNING }).getCount() },
    ])
    const bounds = await this.bounds(
      base().select('MIN(j.created_at)', 'since').addSelect('MAX(j.updated_at)', 'last'),
      'import',
    )
    const failed = await this.failures(
      base()
        .andWhere("j.status = 'failed'")
        .select(['j.filename AS label', 'j.error AS reason', 'j.updated_at AS at'])
        .orderBy('j.updated_at', 'DESC')
        .limit(WORK_FAILURES_PER_FAMILY),
      'import',
    )
    return { measures, ...bounds, failures: failed }
  }

  async enrichments(query: WorkQuery): Promise<FamilyMeasures> {
    const base = (): SelectQueryBuilder<OrgEnrichmentJobEntity> => {
      const qb = this.enrichmentJobs
        .createQueryBuilder('e')
        .leftJoin(AccountEntity, 'a', 'a.id = e.account_id')
        .where('e.workspace_id = :workspaceId', { workspaceId: query.workspaceId })
        .andWhere('e.created_at >= :since', { since: query.since })
      const clause = businessUnitScopeClause(query.businessUnitScope, 'a.business_unit_id', ':...businessUnitIds')
      if (clause) qb.andWhere(clause, { businessUnitIds: query.businessUnitScope?.businessUnitIds ?? [] })
      return qb
    }
    const measures = await this.countEach([
      { counter: 'launched', count: () => base().getCount() },
      { counter: 'done', count: () => base().andWhere('e.status IN (:...s)', { s: ENRICHMENT_DONE }).getCount() },
      { counter: 'failed', count: () => base().andWhere('e.status IN (:...s)', { s: ENRICHMENT_FAILED }).getCount() },
      { counter: 'running', count: () => base().andWhere('e.status IN (:...s)', { s: ENRICHMENT_RUNNING }).getCount() },
    ])
    const bounds = await this.bounds(
      base().select('MIN(e.created_at)', 'since').addSelect('MAX(e.updated_at)', 'last'),
      'enrichment',
    )
    const failed = await this.failures(
      base()
        .andWhere('e.status IN (:...s)', { s: ENRICHMENT_FAILED })
        .select(['e.mode AS label', 'e.error AS reason', 'e.updated_at AS at'])
        .orderBy('e.updated_at', 'DESC')
        .limit(WORK_FAILURES_PER_FAMILY),
      'enrichment',
    )
    return { measures, ...bounds, failures: failed }
  }

  async crmSyncs(query: WorkQuery): Promise<FamilyMeasures> {
    const base = (): SelectQueryBuilder<IntegrationSyncRunEntity> =>
      this.syncRuns
        .createQueryBuilder('s')
        .where('s.workspace_id = :workspaceId', { workspaceId: query.workspaceId })
        .andWhere('s.started_at >= :since', { since: query.since })
    const measures = await this.countEach([
      { counter: 'launched', count: () => base().getCount() },
      { counter: 'done', count: () => base().andWhere('s.status IN (:...s2)', { s2: SYNC_DONE }).getCount() },
      { counter: 'failed', count: () => base().andWhere('s.status IN (:...s2)', { s2: SYNC_FAILED }).getCount() },
      { counter: 'running', count: () => base().andWhere('s.status IN (:...s2)', { s2: SYNC_RUNNING }).getCount() },
    ])
    const bounds = await this.bounds(
      base().select('MIN(s.started_at)', 'since').addSelect('MAX(COALESCE(s.finished_at, s.started_at))', 'last'),
      'crm_sync',
    )
    const failed = await this.failures(
      base()
        .andWhere('s.status IN (:...s2)', { s2: SYNC_FAILED })
        .select(['s.provider AS label', 's.error_fr AS reason', 'COALESCE(s.finished_at, s.started_at) AS at'])
        .orderBy('COALESCE(s.finished_at, s.started_at)', 'DESC')
        .limit(WORK_FAILURES_PER_FAMILY),
      'crm_sync',
    )
    return { measures, ...bounds, failures: failed }
  }

  /**
   * Lot L6 (#4611 « tout le travail en cours ») — les jobs composites de Laura (`workflow_runs`,
   * `definition_key = 'laura_job'`) de l'APPELANT : un job naît de SA conversation, il n'est lu que par
   * lui (même borne que `LauraJobService.listForThread`). « Lancé » = confirmé : un brouillon, un job à
   * confirmer ou reporté n'est pas du travail lancé. Aucune raison d'échec n'est écrite par l'exécuteur
   * sur la ligne : la raison reste `null` (nommée « non fournie »), jamais devinée.
   */
  async lauraJobs(query: WorkQuery): Promise<FamilyMeasures> {
    const base = (): SelectQueryBuilder<WorkflowRunEntity> =>
      this.runs
        .createQueryBuilder('r')
        .where('r.workspace_id = :workspaceId', { workspaceId: query.workspaceId })
        .andWhere('r.user_id = :userId', { userId: query.userId })
        .andWhere('r.definition_key = :definitionKey', { definitionKey: LAURA_JOB_DEFINITION_KEY })
        .andWhere('r.created_at >= :since', { since: query.since })
    const measures = await this.countEach([
      {
        counter: 'launched',
        count: () => base().andWhere('r.status NOT IN (:...s2)', { s2: LAURA_JOB_NOT_LAUNCHED }).getCount(),
      },
      { counter: 'done', count: () => base().andWhere('r.status IN (:...s2)', { s2: LAURA_JOB_DONE }).getCount() },
      { counter: 'failed', count: () => base().andWhere('r.status IN (:...s2)', { s2: LAURA_JOB_FAILED }).getCount() },
      {
        counter: 'running',
        count: () => base().andWhere('r.status IN (:...s2)', { s2: LAURA_JOB_RUNNING }).getCount(),
      },
    ])
    const bounds = await this.bounds(
      base()
        .andWhere('r.status NOT IN (:...s2)', { s2: LAURA_JOB_NOT_LAUNCHED })
        .select('MIN(COALESCE(r.started_at, r.created_at))', 'since')
        .addSelect('MAX(COALESCE(r.finished_at, r.updated_at))', 'last'),
      'laura_job',
    )
    const failed = await this.failures(
      base()
        .andWhere('r.status IN (:...s2)', { s2: LAURA_JOB_FAILED })
        .select(["r.job->>'intent' AS label", 'NULL AS reason', 'COALESCE(r.finished_at, r.updated_at) AS at'])
        .orderBy('COALESCE(r.finished_at, r.updated_at)', 'DESC')
        .limit(WORK_FAILURES_PER_FAMILY),
      'laura_job',
    )
    return { measures, ...bounds, failures: failed }
  }

  /**
   * #4611.4 / .5 — chaque compteur par SA requête ; une requête qui échoue laisse CE compteur `null`
   * (nommé non mesuré par le service), jamais « 0 » ni une valeur tirée des autres.
   */
  private async countEach(counted: readonly Counted[]): Promise<Partial<Record<WorkCounter, number | null>>> {
    const out: Partial<Record<WorkCounter, number | null>> = {}
    for (const { counter, count } of counted) {
      try {
        out[counter] = await count()
      } catch (error) {
        this.logger.warn(`Work progress: compteur ${counter} non mesuré`, {
          error: error instanceof Error ? error.message : String(error),
        })
        out[counter] = null
      }
    }
    return out
  }

  private async bounds<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    family: string,
  ): Promise<{ since: string | null; lastActivityAt: string | null }> {
    try {
      const row = await qb.getRawOne<{ since: Date | string | null; last: Date | string | null }>()
      return { since: isoOrNull(row?.since), lastActivityAt: isoOrNull(row?.last) }
    } catch (error) {
      this.logger.warn(`Work progress: dates de la famille ${family} non lues`, {
        error: error instanceof Error ? error.message : String(error),
      })
      return { since: null, lastActivityAt: null }
    }
  }

  private async failures<T extends ObjectLiteral>(qb: SelectQueryBuilder<T>, family: string): Promise<WorkFailure[]> {
    try {
      const rows = await qb.getRawMany<{ label: string | null; reason: string | null; at: Date | string | null }>()
      return rows.map(row => ({
        label: (row.label ?? '').trim().slice(0, 120) || 'Sans nom',
        // #4611.6 — la raison TELLE QUE L'AMONT L'A DONNÉE ; vide ⇒ `null`, jamais une raison devinée.
        reason: row.reason?.trim() ? row.reason.trim().slice(0, 300) : null,
        at: isoOrNull(row.at),
      }))
    } catch (error) {
      this.logger.warn(`Work progress: raisons d'échec de la famille ${family} non lues`, {
        error: error instanceof Error ? error.message : String(error),
      })
      return []
    }
  }
}

function isoOrNull(value: Date | string | null | undefined): string | null {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
