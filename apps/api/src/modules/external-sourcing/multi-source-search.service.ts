import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import type { Queue } from 'bullmq'
import type { Repository } from 'typeorm'
import {
  rankExternalSourcingCandidates,
  type ExternalSourcingCandidate,
  type MultiSourceSearchItemResult,
} from '@bellum/contracts'
import { MultiSourceSearchJobEntity } from '../../database/entities/multi-source-search-job.entity'
import { ExternalSourcingService } from './external-sourcing.service'
import {
  MULTI_SOURCE_SEARCH_JOB_OPTIONS,
  MULTI_SOURCE_SEARCH_QUEUE,
  type MultiSourceSearchJobData,
} from './multi-source-search.queue'

export type MultiSourceSearchJobView = {
  id: string
  status: 'queued' | 'processing' | 'done' | 'failed'
  total: number | null
  processed: number
  results: MultiSourceSearchItemResult[]
  candidates: ExternalSourcingCandidate[] | null
  error: string | null
}

function toView(row: MultiSourceSearchJobEntity): MultiSourceSearchJobView {
  return {
    id: row.id,
    status: row.status,
    total: row.total,
    processed: row.processed_count,
    results: row.results,
    candidates: row.candidates,
    error: row.error,
  }
}

/**
 * #1952.7 (épopée #2844, lot SRC5 28/09 soir) — LA RECHERCHE MULTI-SOURCES,
 * ASYNCHRONE.
 *
 * Emprunte EXACTEMENT `ExternalSourcingService.searchOneSource` — le même
 * port, la même liste de fournisseurs (`ExternalSourcingProvider`) que la
 * recherche synchrone (`GET needs/:needId/external-sourcing/search`) —, mais
 * une source à la fois plutôt qu'un `Promise.all` : c'est ce qui rend
 * l'avancement observable et permet la reprise après un crash de worker.
 */
@Injectable()
export class MultiSourceSearchService {
  private readonly logger = new Logger(MultiSourceSearchService.name)

  constructor(
    @InjectRepository(MultiSourceSearchJobEntity) private readonly jobs: Repository<MultiSourceSearchJobEntity>,
    @InjectQueue(MULTI_SOURCE_SEARCH_QUEUE) private readonly queue: Queue<MultiSourceSearchJobData>,
    private readonly externalSourcing: ExternalSourcingService,
  ) {}

  async enqueue(
    workspaceId: string,
    userId: string,
    needId: string,
    maxPerSource?: number,
  ): Promise<MultiSourceSearchJobView> {
    const row = await this.jobs.save(
      this.jobs.create({
        workspace_id: workspaceId,
        user_id: userId,
        need_id: needId,
        status: 'queued',
        total: null,
        processed_count: 0,
        results: [],
        candidates: null,
        error: null,
      }),
    )
    await this.queue.add(
      'search',
      { jobId: row.id, workspaceId, userId, needId, maxPerSource },
      { ...MULTI_SOURCE_SEARCH_JOB_OPTIONS, jobId: row.id },
    )
    return toView(row)
  }

  async state(workspaceId: string, jobId: string): Promise<MultiSourceSearchJobView> {
    const row = await this.jobs.findOne({ where: { id: jobId, workspace_id: workspaceId } })
    if (!row) throw new NotFoundException('multi_source_search_job_not_found')
    return toView(row)
  }

  /**
   * Interroge les sources non encore couvertes par `results` — la REPRISE,
   * après un crash de worker. `onProgress` relaie chaque avancée à la
   * passerelle Socket.IO, best-effort.
   */
  async process(
    jobId: string,
    workspaceId: string,
    needId: string,
    maxPerSource: number | undefined,
    onProgress: (view: MultiSourceSearchJobView) => void,
  ): Promise<void> {
    const row = await this.jobs.findOne({ where: { id: jobId, workspace_id: workspaceId } })
    if (!row) return
    const sourceKeys = this.externalSourcing.configuredProviderKeys()
    row.status = 'processing'
    row.total = sourceKeys.length
    await this.jobs.save(row)
    onProgress(toView(row))

    const already = new Set(row.results.map(result => result.source))
    const gathered: ExternalSourcingCandidate[] = []
    for (const sourceKey of sourceKeys) {
      if (already.has(sourceKey)) continue
      const { result, candidates } = await this.searchOne(needId, workspaceId, sourceKey, maxPerSource)
      row.results.push(result)
      gathered.push(...candidates)
      row.processed_count = row.results.length
      await this.jobs.save(row)
      onProgress(toView(row))
    }

    row.candidates = rankExternalSourcingCandidates(gathered)
    row.status = 'done'
    await this.jobs.save(row)
    onProgress(toView(row))
  }

  async markFailed(workspaceId: string, jobId: string, reason: string): Promise<void> {
    await this.jobs.update({ id: jobId, workspace_id: workspaceId }, { status: 'failed', error: reason })
  }

  private async searchOne(
    needId: string,
    workspaceId: string,
    sourceKey: string,
    maxPerSource: number | undefined,
  ): Promise<{ result: MultiSourceSearchItemResult; candidates: ExternalSourcingCandidate[] }> {
    try {
      const candidates = await this.externalSourcing.searchOneSource(needId, workspaceId, sourceKey, maxPerSource)
      if (candidates === null)
        return { result: { source: sourceKey, status: 'failed', error: 'need_not_found' }, candidates: [] }
      return { result: { source: sourceKey, status: 'done', candidateCount: candidates.length }, candidates }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/timeout|timed out/i.test(message)) {
        this.logger.warn('Recherche multi-sources : source sans réponse observée', { sourceKey, error: message })
        return { result: { source: sourceKey, status: 'unknown' }, candidates: [] }
      }
      this.logger.warn('Recherche multi-sources : une source a échoué, les suivantes continuent', {
        sourceKey,
        error: message,
      })
      return { result: { source: sourceKey, status: 'failed', error: message }, candidates: [] }
    }
  }
}
