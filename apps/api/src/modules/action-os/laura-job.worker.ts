import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import type { Job, JobsOptions } from 'bullmq'
import { Correlated } from '../../correlation-id/background-correlation'
import { LauraJobExecutor } from './laura-job.executor'
import { LAURA_JOB_QUEUE, type LauraJobQueueData } from './laura-job.port'

/**
 * #2276 tranche 2 — les options d'un passage d'exécution.
 *
 * JAMAIS de retry automatique : une étape peut être partie quand le passage
 * tombe, et la rejouer est pire que de s'arrêter (doctrine : `unknown` arrête la
 * reprise). La reprise est un GESTE de la personne, sur un job `partial`/`failed`.
 */
export const LAURA_JOB_OPTIONS: JobsOptions = {
  attempts: 1,
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 86_400 },
}

const WORKER_OPTIONS = {
  concurrency: 2,
  // Une étape de 50 cibles enchaîne des appels de 30-85 s : le verrou se
  // renouvelle tant que le worker vit ; un worker mort cale le passage.
  lockDuration: 180_000,
  // Un passage calé ne se relance pas (il pourrait rejouer une étape partie) :
  // il échoue, et `onFailed` rend l'étape en cours `unknown`.
  maxStalledCount: 0,
}

/**
 * #2276 tranche 2 — le worker qui exécute un job composite de Laura, étape par
 * étape (`LauraJobExecutor`). La personne peut fermer l'onglet (#2276.52) : le
 * travail tourne ici, la fiche s'écrit en base, la carte la relit.
 */
@Processor(LAURA_JOB_QUEUE, WORKER_OPTIONS)
@Injectable()
export class LauraJobWorker extends WorkerHost {
  private readonly logger = new Logger(LauraJobWorker.name)

  constructor(private readonly executor: LauraJobExecutor) {
    super()
  }

  @Correlated('worker:laura-job')
  async process(job: Job<LauraJobQueueData>): Promise<void> {
    await this.executor.run(job.data)
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<LauraJobQueueData> | undefined, err: Error): Promise<void> {
    // Identifiants seulement — jamais l'e-mail transporté dans les données.
    this.logger.error('Passage de job de Laura interrompu', { jobId: job?.data.jobId, message: err.message })
    if (job) await this.executor.markUnknown(job.data).catch(() => undefined)
  }
}
