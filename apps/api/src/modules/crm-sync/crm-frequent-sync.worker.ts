import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import type { Job } from 'bullmq'
import { CRM_FREQUENT_SYNC_QUEUE, type CrmFrequentSyncJobData } from './crm-frequent-sync.queue'
import { CrmFrequentSyncService, type CrmPassResult } from './crm-frequent-sync.service'

/** SYNC-C — exécute un passage de la file ; toute la logique (verrou, budget, recul) est dans le service. */
@Processor(CRM_FREQUENT_SYNC_QUEUE, { concurrency: 3 })
@Injectable()
export class CrmFrequentSyncWorker extends WorkerHost {
  constructor(private readonly sync: CrmFrequentSyncService) {
    super()
  }

  async process(job: Job<CrmFrequentSyncJobData>): Promise<CrmPassResult> {
    return this.sync.runPass(job.data)
  }
}
