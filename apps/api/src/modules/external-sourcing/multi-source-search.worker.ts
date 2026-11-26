import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger, Optional } from '@nestjs/common'
import type { Job } from 'bullmq'
import { Correlated } from '../../correlation-id/background-correlation'
import { MultiSourceSearchGateway } from './multi-source-search.gateway'
import { MULTI_SOURCE_SEARCH_QUEUE, type MultiSourceSearchJobData } from './multi-source-search.queue'
import { MultiSourceSearchService } from './multi-source-search.service'

/** Plusieurs lots peuvent tourner de front : chaque source interrogée est une lecture bornée. */
const WORKER_OPTIONS = { concurrency: 3, lockDuration: 300_000 }

/**
 * #1952.7 (épopée #2844, lot SRC5 28/09 soir) — l'orchestrateur asynchrone de
 * la recherche multi-sources. Aucune logique métier ici :
 * `MultiSourceSearchService.process` fait tout le travail.
 */
@Processor(MULTI_SOURCE_SEARCH_QUEUE, WORKER_OPTIONS)
@Injectable()
export class MultiSourceSearchWorker extends WorkerHost {
  private readonly logger = new Logger(MultiSourceSearchWorker.name)

  constructor(
    private readonly multiSourceSearch: MultiSourceSearchService,
    @Optional() private readonly gateway?: MultiSourceSearchGateway,
  ) {
    super()
  }

  @Correlated('worker:multi-source-search')
  async process(job: Job<MultiSourceSearchJobData>): Promise<void> {
    const { jobId, workspaceId, needId, maxPerSource } = job.data
    await this.multiSourceSearch.process(jobId, workspaceId, needId, maxPerSource, view =>
      this.gateway?.emitProgress(view),
    )
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<MultiSourceSearchJobData> | undefined, err: Error): Promise<void> {
    if (!job?.data.jobId) return
    this.logger.error('Recherche multi-sources : tentative en échec', { jobId: job.data.jobId, name: err.name })
    if ((job.attemptsMade ?? 0) < (job.opts.attempts ?? 1)) return
    await this.multiSourceSearch.markFailed(job.data.workspaceId, job.data.jobId, `interrupted:${err.name}`)
  }
}
