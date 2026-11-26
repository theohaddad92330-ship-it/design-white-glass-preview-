import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger, Optional } from '@nestjs/common'
import type { Job } from 'bullmq'
import { Correlated } from '../../../correlation-id/background-correlation'
import { AUTO_NEED_MATCH_JOB, type AutoNeedMatchJobData } from './auto-need-matching.queue'
import { AutoNeedMatchingService } from './auto-need-matching.service'
import { BulkMatchingGateway } from './bulk-matching.gateway'
import { BULK_MATCHING_QUEUE, type BulkMatchingJobData } from './bulk-matching.queue'
import { BulkMatchingService } from './bulk-matching.service'

/** Un lot à la fois par instance : le matching lit toute la pondération de
 *  l'espace et le vivier entier par besoin — pas de raison d'en superposer
 *  deux au même moment. */
const WORKER_OPTIONS = { concurrency: 1, lockDuration: 600_000 }

/**
 * #1952.3 (épopée #2844, lot SRC5 28/09 soir) — l'orchestrateur asynchrone du
 * matching massif. Aucune logique métier ici : `BulkMatchingService.process`
 * fait tout le travail, ce worker relaie chaque avancée à la passerelle.
 */
@Processor(BULK_MATCHING_QUEUE, WORKER_OPTIONS)
@Injectable()
export class BulkMatchingWorker extends WorkerHost {
  private readonly logger = new Logger(BulkMatchingWorker.name)

  constructor(
    private readonly bulkMatching: BulkMatchingService,
    @Optional() private readonly gateway?: BulkMatchingGateway,
    @Optional() private readonly autoMatching?: AutoNeedMatchingService,
  ) {
    super()
  }

  @Correlated('worker:bulk-matching')
  async process(job: Job<BulkMatchingJobData | AutoNeedMatchJobData>): Promise<void> {
    if (isAutoNeedMatch(job)) {
      await this.autoMatching?.process(job.data)
      return
    }
    const data = job.data
    if (!('jobId' in data)) return
    const { jobId, workspaceId, userId, canReadFinance } = data
    await this.bulkMatching.process(jobId, workspaceId, userId, canReadFinance, view =>
      this.gateway?.emitProgress(view),
    )
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<BulkMatchingJobData | AutoNeedMatchJobData> | undefined, err: Error): Promise<void> {
    if (job && isAutoNeedMatch(job)) {
      this.logger.error('Matching automatique : tentative en échec', { needId: job.data.needId, name: err.name })
      if ((job.attemptsMade ?? 0) < (job.opts.attempts ?? 1)) return
      await this.autoMatching?.markFailed(job.data)
      return
    }
    const data = job?.data
    if (!job || !data || !('jobId' in data) || !data.jobId) return
    this.logger.error('Matching massif : tentative en échec', { jobId: data.jobId, name: err.name })
    if ((job.attemptsMade ?? 0) < (job.opts.attempts ?? 1)) return
    await this.bulkMatching.markFailed(data.workspaceId, data.jobId, `interrupted:${err.name}`)
  }
}

function isAutoNeedMatch(job: Job<BulkMatchingJobData | AutoNeedMatchJobData>): job is Job<AutoNeedMatchJobData> {
  return job.name === AUTO_NEED_MATCH_JOB
}
