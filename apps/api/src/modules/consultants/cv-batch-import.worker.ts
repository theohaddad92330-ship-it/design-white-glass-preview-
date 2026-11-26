import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { type Job } from 'bullmq'
import type { CvBatchFileOutcome } from '@bellum/contracts'
import { CvBatchImportJobEntity } from '../../database/entities/cv-batch-import-job.entity'
import { CvIntakeService } from './cv-intake.service'
import { CV_BATCH_IMPORT_QUEUE, type CvBatchImportJobData, type CvBatchImportJobResult } from './cv-batch-import.queue'
import { Correlated } from '../../correlation-id/background-correlation'

/**
 * Traite un lot à la fois — un import est déjà un fan-out de plusieurs
 * dizaines à quelques centaines d'appels à `CvIntakeService`, pas la peine
 * d'en superposer deux.
 */
const WORKER_OPTIONS = { concurrency: 1, lockDuration: 300_000 }

/**
 * L'orchestrateur async de l'import de CV en masse (#2326.12, épopée #2794).
 *
 * Aucune logique de dépôt ici : chaque entrée traverse
 * {@link CvIntakeService.intakeAutomatic}, EXACTEMENT le chemin que
 * `CvBatchImportService.importZip`/`importFiles` empruntaient déjà en
 * synchrone. Ce qui change : la ligne `cv_batch_import_jobs` avance à CHAQUE
 * fichier, jamais en un seul bloc à la fin — c'est elle qui permet à l'écran de
 * suivre une progression réelle, et au worker de reprendre exactement où il
 * s'est arrêté si BullMQ retente le job après un crash (`processed_count`,
 * jamais un rejeu depuis la première entrée).
 */
@Processor(CV_BATCH_IMPORT_QUEUE, WORKER_OPTIONS)
@Injectable()
export class CvBatchImportWorker extends WorkerHost {
  private readonly logger = new Logger(CvBatchImportWorker.name)

  constructor(
    private readonly cvIntake: CvIntakeService,
    @InjectRepository(CvBatchImportJobEntity)
    private readonly jobs: Repository<CvBatchImportJobEntity>,
  ) {
    super()
  }

  @Correlated('worker:cv-batch-import')
  async process(job: Job<CvBatchImportJobData>): Promise<CvBatchImportJobResult> {
    const { jobId, workspaceId, userId, entries } = job.data
    const row = await this.jobs.findOne({ where: { id: jobId, workspace_id: workspaceId } })
    if (!row) {
      // La ligne a disparu (espace supprimé, purge de démo) — le job n'a plus
      // personne à qui rendre son résultat, ce n'est pas une panne à retenter.
      this.logger.warn(`Job d'import CV introuvable, abandonné (${jobId})`)
      return { ok: false, reason: 'job introuvable' }
    }

    await this.jobs.update({ id: jobId }, { status: 'processing' })

    // Reprend là où la tentative précédente s'est arrêtée — jamais depuis zéro.
    const startAt = Math.min(row.processed_count, entries.length)
    const outcomes: CvBatchFileOutcome[] = [...row.outcomes]

    for (let index = startAt; index < entries.length; index += 1) {
      const entry = entries[index]
      const outcome = await this.cvIntake.intakeAutomatic(workspaceId, userId, {
        filename: entry.filename,
        fileB64: entry.fileB64,
        capturedAt: entry.capturedAtMs !== null ? new Date(entry.capturedAtMs) : null,
      })
      outcomes.push(outcome)
      await this.jobs.update({ id: jobId }, { processed_count: index + 1, outcomes })
    }

    await this.jobs.update({ id: jobId }, { status: 'done' })
    return { ok: true, processed: entries.length }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<CvBatchImportJobData> | undefined, err: Error): Promise<void> {
    this.logger.error('Import de CV en masse en échec', { jobId: job?.data.jobId, message: err.message })
    if (!job?.data.jobId) return
    // Une tentative future de BullMQ (`attempts`) reprend quand même depuis
    // `processed_count` — l'échec ne s'écrit ici que si TOUTES les tentatives
    // sont épuisées, sinon `attemptsMade` est encore inférieur au plafond.
    if ((job.attemptsMade ?? 0) < (job.opts.attempts ?? 1)) return
    await this.jobs.update({ id: job.data.jobId }, { status: 'failed', error: err.message })
  }
}
