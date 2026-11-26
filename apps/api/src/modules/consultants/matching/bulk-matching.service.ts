import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import type { Queue } from 'bullmq'
import type { Repository } from 'typeorm'
import type { BulkMatchingItemResult } from '@bellum/contracts'
import { BulkMatchingJobEntity } from '../../../database/entities/bulk-matching-job.entity'
import { MatchingService } from './matching.service'
import { BULK_MATCHING_JOB_OPTIONS, BULK_MATCHING_QUEUE, type BulkMatchingJobData } from './bulk-matching.queue'

/** Le plafond d'un lot — un nombre ÉCRIT, jamais un « tout » qui grossirait sans fin. */
export const BULK_MATCHING_MAX_NEEDS = 200

export type BulkMatchingJobView = {
  id: string
  status: 'queued' | 'processing' | 'done' | 'failed'
  total: number
  processed: number
  results: BulkMatchingItemResult[]
  error: string | null
}

function toView(row: BulkMatchingJobEntity): BulkMatchingJobView {
  return {
    id: row.id,
    status: row.status,
    total: row.total,
    processed: row.processed_count,
    results: row.results,
    error: row.error,
  }
}

/**
 * #1952.3 (épopée #2844, lot SRC5 28/09 soir) — LE MATCHING MASSIF.
 *
 * Chaque besoin du lot emprunte EXACTEMENT `MatchingService.matchNeed`, le
 * chemin d'un matching unitaire (`POST needs/:id/match`) — aucun second moteur
 * de classement. Ce service n'orchestre que la FILE et la PERSISTANCE de
 * l'avancement ; le worker (`bulk-matching.worker.ts`) appelle `process` et
 * relaie chaque avancée à la passerelle Socket.IO.
 *
 * Isolation par besoin (même règle que `AnalysisBatchesService`, #2293.7) :
 * l'échec d'UN besoin ne bloque pas les suivants, et se lit dans `results`,
 * jamais dans le statut du job entier.
 */
@Injectable()
export class BulkMatchingService {
  private readonly logger = new Logger(BulkMatchingService.name)

  constructor(
    @InjectRepository(BulkMatchingJobEntity) private readonly jobs: Repository<BulkMatchingJobEntity>,
    @InjectQueue(BULK_MATCHING_QUEUE) private readonly queue: Queue<BulkMatchingJobData>,
    private readonly matching: MatchingService,
  ) {}

  async enqueue(
    workspaceId: string,
    userId: string,
    needIds: readonly string[],
    canReadFinance: boolean,
  ): Promise<BulkMatchingJobView> {
    const row = await this.jobs.save(
      this.jobs.create({
        workspace_id: workspaceId,
        user_id: userId,
        need_ids: [...needIds],
        status: 'queued',
        total: needIds.length,
        processed_count: 0,
        results: [],
        error: null,
      }),
    )
    await this.queue.add(
      'match',
      { jobId: row.id, workspaceId, userId, canReadFinance },
      { ...BULK_MATCHING_JOB_OPTIONS, jobId: row.id },
    )
    return toView(row)
  }

  async state(workspaceId: string, jobId: string): Promise<BulkMatchingJobView> {
    const row = await this.jobs.findOne({ where: { id: jobId, workspace_id: workspaceId } })
    if (!row) throw new NotFoundException('bulk_matching_job_not_found')
    return toView(row)
  }

  /**
   * Traite les besoins non encore couverts par `results` — la REPRISE, après
   * un crash de worker : `processed_count` dit exactement où continuer.
   * `onProgress` relaie chaque avancée à la passerelle Socket.IO, best-effort
   * (une panne du relais temps réel ne doit jamais arrêter le lot).
   */
  async process(
    jobId: string,
    workspaceId: string,
    userId: string,
    canReadFinance: boolean,
    onProgress: (view: BulkMatchingJobView) => void,
  ): Promise<void> {
    const row = await this.jobs.findOne({ where: { id: jobId, workspace_id: workspaceId } })
    if (!row) return
    row.status = 'processing'
    await this.jobs.save(row)
    onProgress(toView(row))

    const already = new Set(row.results.map(result => result.needId))
    for (const needId of row.need_ids) {
      if (already.has(needId)) continue
      row.results.push(await this.matchOne(needId, workspaceId, userId, canReadFinance))
      row.processed_count = row.results.length
      await this.jobs.save(row)
      onProgress(toView(row))
    }

    row.status = 'done'
    await this.jobs.save(row)
    onProgress(toView(row))
  }

  /** Marque un job en échec TOP-NIVEAU (crash du worker) — les besoins déjà dans `results` restent acquis. */
  async markFailed(workspaceId: string, jobId: string, reason: string): Promise<void> {
    await this.jobs.update({ id: jobId, workspace_id: workspaceId }, { status: 'failed', error: reason })
  }

  private async matchOne(
    needId: string,
    workspaceId: string,
    userId: string,
    canReadFinance: boolean,
  ): Promise<BulkMatchingItemResult> {
    try {
      const run = await this.matching.matchNeed(needId, workspaceId, userId, { canReadFinance })
      if (!run) return { needId, status: 'failed', error: 'need_not_found' }
      return { needId, status: 'done', matchCount: run.recommended.length }
    } catch (error) {
      // Le matching est un calcul interne, ZÉRO crédit — mais une requête DB
      // qui timeout n'a pas pour autant « répondu non » : « un timeout n'est
      // pas un échec » (CLAUDE.md), ce besoin reste `unknown`, jamais `failed`.
      const message = error instanceof Error ? error.message : String(error)
      if (/timeout|timed out/i.test(message)) {
        this.logger.warn('Matching massif : besoin sans réponse observée', { needId, error: message })
        return { needId, status: 'unknown' }
      }
      this.logger.warn('Matching massif : un besoin a échoué, les suivants continuent', { needId, error: message })
      return { needId, status: 'failed', error: message }
    }
  }
}
