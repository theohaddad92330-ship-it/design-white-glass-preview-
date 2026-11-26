import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import type { Queue } from 'bullmq'
import type { Repository } from 'typeorm'
import type { BulkCvRewriteItemResult } from '@bellum/contracts'
import { BulkCvRewriteJobEntity } from '../../database/entities/bulk-cv-rewrite-job.entity'
import { ConsultantsService } from './consultants.service'
import { CreditsService } from '../credits/credits.service'
import { BULK_CV_REWRITE_JOB_OPTIONS, BULK_CV_REWRITE_QUEUE, type BulkCvRewriteJobData } from './bulk-cv-rewrite.queue'
import { SOFT_BRAKE_MESSAGE } from '../credits/soft-brake'

/** Le plafond d'un lot — un nombre ÉCRIT, jamais un « tout » qui grossirait sans fin. */
export const BULK_CV_REWRITE_MAX_CONSULTANTS = 50

export type BulkCvRewriteJobView = {
  id: string
  status: 'queued' | 'processing' | 'done' | 'failed'
  total: number
  processed: number
  results: BulkCvRewriteItemResult[]
  error: string | null
}

function toView(row: BulkCvRewriteJobEntity): BulkCvRewriteJobView {
  return {
    id: row.id,
    status: row.status,
    total: row.total,
    processed: row.processed_count,
    results: row.results,
    error: row.error,
  }
}

/**
 * #1952.5 (épopée #2844, lot SRC5 28/09 soir) — LA RÉÉCRITURE DE CV EN LOT.
 *
 * Chaque consultant du lot emprunte EXACTEMENT `ConsultantsService.rewriteCv`
 * — le chemin d'un geste unitaire (`POST :id/cv-rewrite`) — aucun second
 * moteur de réécriture. Ce service n'orchestre que la FILE, la PERSISTANCE
 * de l'avancement et le débit crédit PAR CONSULTANT (jamais un prix de lot
 * inventé, #1952.2 reste hors de cette tranche) ; le worker
 * (`bulk-cv-rewrite.worker.ts`) appelle `process` et relaie chaque avancée à
 * la passerelle Socket.IO.
 *
 * Isolation par consultant (même règle que `BulkMatchingService`, #2293.7) :
 * l'échec IA sur UN profil n'arrête pas les suivants.
 */
@Injectable()
export class BulkCvRewriteService {
  private readonly logger = new Logger(BulkCvRewriteService.name)

  constructor(
    @InjectRepository(BulkCvRewriteJobEntity) private readonly jobs: Repository<BulkCvRewriteJobEntity>,
    @InjectQueue(BULK_CV_REWRITE_QUEUE) private readonly queue: Queue<BulkCvRewriteJobData>,
    private readonly consultants: ConsultantsService,
    private readonly credits: CreditsService,
  ) {}

  async enqueue(
    workspaceId: string,
    userId: string,
    opportunityId: string,
    consultantIds: readonly string[],
    isDemo: boolean,
  ): Promise<BulkCvRewriteJobView> {
    // Même refus que le geste unitaire (`ConsultantsController.rewriteCv`) :
    // un CV réécrit d'avance serait un document nominatif fictif, et la
    // démonstration ne promet ni crédit débité ni appel modèle.
    if (isDemo) {
      throw new ForbiddenException(
        'La réécriture de CV est désactivée dans l’espace de démonstration : elle coûte 1 crédit et appelle un modèle par consultant.',
      )
    }
    if (!(await this.credits.hasEnrichmentCredit(userId))) {
      throw new ForbiddenException(SOFT_BRAKE_MESSAGE)
    }
    const row = await this.jobs.save(
      this.jobs.create({
        workspace_id: workspaceId,
        user_id: userId,
        opportunity_id: opportunityId,
        consultant_ids: [...consultantIds],
        status: 'queued',
        total: consultantIds.length,
        processed_count: 0,
        results: [],
        error: null,
      }),
    )
    await this.queue.add(
      'rewrite',
      { jobId: row.id, workspaceId, userId },
      { ...BULK_CV_REWRITE_JOB_OPTIONS, jobId: row.id },
    )
    return toView(row)
  }

  async state(workspaceId: string, jobId: string): Promise<BulkCvRewriteJobView> {
    const row = await this.jobs.findOne({ where: { id: jobId, workspace_id: workspaceId } })
    if (!row) throw new NotFoundException('bulk_cv_rewrite_job_not_found')
    return toView(row)
  }

  /**
   * Traite les consultants non encore couverts par `results` — la REPRISE,
   * après un crash de worker.
   */
  async process(
    jobId: string,
    workspaceId: string,
    userId: string,
    onProgress: (view: BulkCvRewriteJobView) => void,
  ): Promise<void> {
    const row = await this.jobs.findOne({ where: { id: jobId, workspace_id: workspaceId } })
    if (!row) return
    row.status = 'processing'
    await this.jobs.save(row)
    onProgress(toView(row))

    const already = new Set(row.results.map(result => result.consultantId))
    for (const consultantId of row.consultant_ids) {
      if (already.has(consultantId)) continue
      row.results.push(await this.rewriteOne(consultantId, row.opportunity_id, workspaceId, userId))
      row.processed_count = row.results.length
      await this.jobs.save(row)
      onProgress(toView(row))
    }

    row.status = 'done'
    await this.jobs.save(row)
    onProgress(toView(row))
  }

  /** Marque un job en échec TOP-NIVEAU (crash du worker) — les consultants déjà dans `results` restent acquis. */
  async markFailed(workspaceId: string, jobId: string, reason: string): Promise<void> {
    await this.jobs.update({ id: jobId, workspace_id: workspaceId }, { status: 'failed', error: reason })
  }

  private async rewriteOne(
    consultantId: string,
    opportunityId: string,
    workspaceId: string,
    userId: string,
  ): Promise<BulkCvRewriteItemResult> {
    try {
      const result = await this.consultants.rewriteCv(consultantId, opportunityId, workspaceId, userId)
      if (!result.ok) {
        const error = result.code === 'no_cv' ? 'no_cv' : result.code === 'not_found' ? 'not_found' : 'ia_failed'
        return { consultantId, status: 'failed', error }
      }
      // Même règle que le geste unitaire : on ne débite qu'APRÈS un CV
      // réellement produit, JAMAIS un prix de lot — un crédit par consultant.
      const debit = await this.credits.consumeEnrichmentCredit(userId, { reason: 'cv_rewrite' })
      if (!debit.ok) return { consultantId, status: 'failed', error: 'insufficient_credits' }
      return { consultantId, status: 'done', charged: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/timeout|timed out/i.test(message)) {
        this.logger.warn('Réécriture en lot : consultant sans réponse observée', { consultantId, error: message })
        return { consultantId, status: 'unknown' }
      }
      this.logger.warn('Réécriture en lot : un consultant a échoué, les suivants continuent', {
        consultantId,
        error: message,
      })
      return { consultantId, status: 'failed', error: message }
    }
  }
}
