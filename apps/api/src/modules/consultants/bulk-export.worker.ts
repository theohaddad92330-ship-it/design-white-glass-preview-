import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger, Optional } from '@nestjs/common'
import type { Job } from 'bullmq'
import { Correlated } from '../../correlation-id/background-correlation'
import { BulkExportGateway } from './bulk-export.gateway'
import { BULK_EXPORT_QUEUE, type BulkExportJobData } from './bulk-export.queue'
import { BulkExportService } from './bulk-export.service'

/** Un export à la fois par instance : une pagination du vivier entier, pas un aller-retour léger. */
const WORKER_OPTIONS = { concurrency: 1, lockDuration: 600_000 }

/**
 * #1952.6 (épopée #2844, lot SRC5 28/09 soir) — l'orchestrateur asynchrone de
 * l'export en lot. Aucune logique métier ici : `BulkExportService.process`
 * fait tout le travail.
 */
@Processor(BULK_EXPORT_QUEUE, WORKER_OPTIONS)
@Injectable()
export class BulkExportWorker extends WorkerHost {
  private readonly logger = new Logger(BulkExportWorker.name)

  constructor(
    private readonly bulkExport: BulkExportService,
    @Optional() private readonly gateway?: BulkExportGateway,
  ) {
    super()
  }

  @Correlated('worker:bulk-export')
  async process(job: Job<BulkExportJobData>): Promise<void> {
    const { jobId, workspaceId } = job.data
    await this.bulkExport.process(jobId, workspaceId, view => this.gateway?.emitProgress(view))
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<BulkExportJobData> | undefined, err: Error): Promise<void> {
    if (!job?.data.jobId) return
    this.logger.error('Export en lot : tentative en échec', { jobId: job.data.jobId, name: err.name })
    if ((job.attemptsMade ?? 0) < (job.opts.attempts ?? 1)) return
    await this.bulkExport.markFailed(job.data.workspaceId, job.data.jobId, `interrupted:${err.name}`)
  }
}
