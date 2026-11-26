import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import type { CrmFirstImportState } from '@bellum/contracts'
import { Correlated } from '../../correlation-id/background-correlation'
import { CRM_FIRST_IMPORT_QUEUE, type CrmFirstImportJobData } from '../crm-first-import/crm-first-import.queue'
import { CrmFirstImportRunner } from './crm-first-import.runner'

/** SYNC-B — une reprise à la fois par réplique, bornée dans le temps par le runner (jamais de spinner éternel). */
@Processor(CRM_FIRST_IMPORT_QUEUE, { concurrency: 1, lockDuration: 300_000 })
@Injectable()
export class CrmFirstImportWorker extends WorkerHost {
  private readonly logger = new Logger(CrmFirstImportWorker.name)

  constructor(private readonly runner: CrmFirstImportRunner) {
    super()
  }

  @Correlated('worker:crm-first-import')
  async process(job: Job<CrmFirstImportJobData>): Promise<CrmFirstImportState> {
    return this.runner.run(job.data, async state => {
      await job.updateProgress(state)
    })
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<CrmFirstImportJobData> | undefined, err: Error): void {
    this.logger.error('Première reprise CRM en échec', { provider: job?.data.provider, message: err.message })
  }
}
