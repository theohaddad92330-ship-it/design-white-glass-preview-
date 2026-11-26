import { InjectQueue, OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { Worker, type Job, type Queue } from 'bullmq'
import { Correlated } from '../../correlation-id/background-correlation'
import {
  CV_AUTO_PARSE_CONCURRENCY,
  CV_AUTO_PARSE_MAX_DEFERRALS,
  CV_AUTO_PARSE_QUEUE,
  CV_AUTO_PARSE_RATE_PER_MINUTE,
  iaBackoffDelayMs,
  type CvAutoParseJobData,
} from './cv-auto-parse.queue'
import { CvAutoParseService } from './cv-auto-parse.service'

/** #3935 (lot BATCH-CV, 12/10/2026) — la concurrence vient de l'env (`CV_AUTO_PARSE_CONCURRENCY`,
 *  défaut 8, borné [1, 24]) ; GA-303 (`database.module.spec.ts`) lit son DÉFAUT dans
 *  `cv-auto-parse.queue.ts`. Le limiteur borne les lectures démarrées par minute, tous réplicas
 *  confondus. Une lecture dure quelques secondes, le verrou large n'est qu'une marge. */
const WORKER_OPTIONS = {
  concurrency: CV_AUTO_PARSE_CONCURRENCY,
  lockDuration: 120_000,
  limiter: { max: CV_AUTO_PARSE_RATE_PER_MINUTE, duration: 60_000 },
}

/**
 * Lecture automatique des CV à l'import (04/10/2026, `c88_lecture_auto_cv_import`).
 * Aucune logique métier ici : `CvAutoParseService.readOne` fait tout.
 *
 * Un échec (service IA indisponible) est réessayé par la file
 * (`CV_AUTO_PARSE_JOB_OPTIONS`) ; après la dernière tentative, il est
 * JOURNALISÉ et la fiche reste lisible, « non lue », donc rattrapable par
 * « Lire les CV non lus » — jamais une valeur inventée.
 */
@Processor(CV_AUTO_PARSE_QUEUE, WORKER_OPTIONS)
@Injectable()
export class CvAutoParseWorker extends WorkerHost {
  private readonly logger = new Logger(CvAutoParseWorker.name)

  constructor(
    private readonly autoParse: CvAutoParseService,
    @InjectQueue(CV_AUTO_PARSE_QUEUE) private readonly queue: Queue<CvAutoParseJobData>,
  ) {
    super()
  }

  @Correlated('worker:cv-auto-parse')
  async process(job: Job<CvAutoParseJobData>): Promise<{ written: number }> {
    try {
      return await this.autoParse.readOne(job.data)
    } catch (error) {
      // #3935 — service IA saturé (429/503) : la FILE entière marque une pause (`retry-after`
      // respecté), la fiche retourne en attente SANS consommer de tentative. Au-delà de
      // CV_AUTO_PARSE_MAX_DEFERRALS reports, l'erreur redevient un échec ordinaire.
      const delayMs = iaBackoffDelayMs(error)
      const deferrals = job.data.deferrals ?? 0
      if (delayMs === null || deferrals >= CV_AUTO_PARSE_MAX_DEFERRALS) throw error
      await job.updateData({ ...job.data, deferrals: deferrals + 1 })
      await this.queue.rateLimit(delayMs)
      this.logger.warn('Service IA saturé : lecture des CV en pause', {
        consultantId: job.data.consultantId,
        delayMs,
        deferrals: deferrals + 1,
      })
      throw Worker.RateLimitError()
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<CvAutoParseJobData> | undefined, err: Error): void {
    this.logger.error('Lecture automatique d’un CV en échec', {
      consultantId: job?.data.consultantId,
      workspaceId: job?.data.workspaceId,
      attemptsMade: job?.attemptsMade,
      message: err.message,
    })
  }
}
