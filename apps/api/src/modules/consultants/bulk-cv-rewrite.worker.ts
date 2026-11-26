import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger, Optional } from '@nestjs/common'
import type { Job } from 'bullmq'
import { Correlated } from '../../correlation-id/background-correlation'
import { BulkCvRewriteGateway } from './bulk-cv-rewrite.gateway'
import { BULK_CV_REWRITE_QUEUE, type BulkCvRewriteJobData } from './bulk-cv-rewrite.queue'
import { BulkCvRewriteService } from './bulk-cv-rewrite.service'

/** Un lot à la fois par instance : chaque item appelle déjà un modèle, pas de raison d'en superposer plusieurs. */
const WORKER_OPTIONS = { concurrency: 1, lockDuration: 600_000 }

/**
 * #1952.5 (épopée #2844, lot SRC5 28/09 soir) — l'orchestrateur asynchrone de
 * la réécriture de CV en lot. Aucune logique métier ici :
 * `BulkCvRewriteService.process` fait tout le travail.
 */
@Processor(BULK_CV_REWRITE_QUEUE, WORKER_OPTIONS)
@Injectable()
export class BulkCvRewriteWorker extends WorkerHost {
  private readonly logger = new Logger(BulkCvRewriteWorker.name)

  constructor(
    private readonly bulkCvRewrite: BulkCvRewriteService,
    @Optional() private readonly gateway?: BulkCvRewriteGateway,
  ) {
    super()
  }

  @Correlated('worker:bulk-cv-rewrite')
  async process(job: Job<BulkCvRewriteJobData>): Promise<void> {
    const { jobId, workspaceId, userId } = job.data
    await this.bulkCvRewrite.process(jobId, workspaceId, userId, view => this.gateway?.emitProgress(view))
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<BulkCvRewriteJobData> | undefined, err: Error): Promise<void> {
    if (!job?.data.jobId) return
    this.logger.error('Réécriture de CV en lot : tentative en échec', { jobId: job.data.jobId, name: err.name })
    if ((job.attemptsMade ?? 0) < (job.opts.attempts ?? 1)) return
    await this.bulkCvRewrite.markFailed(job.data.workspaceId, job.data.jobId, `interrupted:${err.name}`)
  }
}
