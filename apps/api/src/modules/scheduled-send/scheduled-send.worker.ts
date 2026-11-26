import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import type { Job } from 'bullmq'
import { Correlated } from '../../correlation-id/background-correlation'
import { SCHEDULED_SEND_QUEUE, type ScheduledSendJobData } from './scheduled-send.queue'
import { ScheduledSendService } from './scheduled-send.service'

/**
 * Théo M2 — envoi programmé — aucune logique ici : `ScheduledSendService.dispatch` relit la ligne, vérifie que la
 * validation du commercial tient, réserve, puis passe par le chemin de « Envoyer ». `proof` lève tant que le message
 * n'est pas retrouvé dans la boîte, pour que BullMQ regarde de nouveau (quatre fois, espacées) — jamais un renvoi.
 * Concurrence posée explicitement (GA-303).
 */
@Processor(SCHEDULED_SEND_QUEUE, { concurrency: 2 })
@Injectable()
export class ScheduledSendWorker extends WorkerHost {
  private readonly logger = new Logger(ScheduledSendWorker.name)

  constructor(private readonly scheduled: ScheduledSendService) {
    super()
  }

  @Correlated('worker:scheduled-message-send')
  async process(job: Job<ScheduledSendJobData>): Promise<{ result: string }> {
    if (job.name === 'proof') {
      if (!(await this.scheduled.confirmProof(job.data.scheduledSendId))) {
        throw new Error('Message pas encore retrouvé dans les éléments envoyés')
      }
      return { result: 'proven' }
    }
    return { result: await this.scheduled.dispatch(job.data.scheduledSendId) }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ScheduledSendJobData> | undefined, err: Error): void {
    this.logger.warn('Envoi programmé : passage en échec', {
      scheduledSendId: job?.data.scheduledSendId,
      job: job?.name,
      attemptsMade: job?.attemptsMade,
      message: err.message,
    })
  }
}
