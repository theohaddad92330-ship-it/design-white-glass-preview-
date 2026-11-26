import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { Correlated } from '../../correlation-id/background-correlation'
import { WORKSPACE_MERGE_QUEUE, type WorkspaceMergeJobData } from './workspace-merge.queue'
import { WorkspaceMergeService } from './workspace-merge.service'

/**
 * #4158.57 — le rapatriement d'un espace personnel. Aucune logique ici : `WorkspaceMergeService.run`
 * vérifie la double validation et l'empreinte, puis rejoue l'aperçu figé ligne à ligne (idempotent).
 * Une demande à la fois : `concurrency: 1`, posée explicitement (GA-303).
 */
@Processor(WORKSPACE_MERGE_QUEUE, { concurrency: 1, lockDuration: 300_000 })
@Injectable()
export class WorkspaceMergeWorker extends WorkerHost {
  private readonly logger = new Logger(WorkspaceMergeWorker.name)

  constructor(private readonly merge: WorkspaceMergeService) {
    super()
  }

  @Correlated('worker:workspace-merge')
  async process(job: Job<WorkspaceMergeJobData>): Promise<{ written: boolean }> {
    const { written } = await this.merge.run(job.data.requestId, { write: job.data.write, hash: job.data.hash })
    return { written }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<WorkspaceMergeJobData> | undefined, err: Error): void {
    this.logger.error('Rapatriement d’espace en échec', {
      requestId: job?.data.requestId,
      attemptsMade: job?.attemptsMade,
      message: err.message,
    })
  }
}
