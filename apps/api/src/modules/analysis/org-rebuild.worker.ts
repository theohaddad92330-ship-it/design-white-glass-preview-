import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { type Job } from 'bullmq'
import { isFailure } from '@bellum/utils'
import { AnalysisOnDemandService } from './analysis-ondemand.service'
import { ORG_REBUILD_QUEUE, type OrgRebuildJobData, type OrgRebuildJobResult } from './org-rebuild.queue'
import { Correlated } from '../../correlation-id/background-correlation'

/**
 * Une reconstruction à la fois par instance : c'est un fan-out LLM, pas un clic.
 * Le verrou couvre le pire cas de la phase 3 (240 s de budget réseau) avec de la
 * marge — sinon un job lent-mais-vivant serait déclaré perdu et son travail jeté.
 */
const WORKER_OPTIONS = {
  concurrency: 2,
  lockDuration: 300_000,
}

/**
 * Reconstruit le graphe d'organigramme d'un compte en tâche de fond.
 *
 * Aucune logique métier ici : le worker appelle
 * {@link AnalysisOnDemandService.enrichOrganigram}, c'est-à-dire EXACTEMENT le
 * chemin du bouton « Enrichir l'organigramme ». Mémoire du graphe, persistance,
 * refus en espace de démonstration : tout reste là-bas, en un seul exemplaire.
 */
@Processor(ORG_REBUILD_QUEUE, WORKER_OPTIONS)
@Injectable()
export class OrgRebuildWorker extends WorkerHost {
  private readonly logger = new Logger(OrgRebuildWorker.name)

  constructor(private readonly onDemand: AnalysisOnDemandService) {
    super()
  }

  @Correlated('worker:org-rebuild')
  async process(job: Job<OrgRebuildJobData>): Promise<OrgRebuildJobResult> {
    const { accountId, userId } = job.data
    const result = await this.onDemand.enrichOrganigram(accountId, userId)

    // Un « non » motivé est une RÉPONSE, pas un incident : le lever ferait de
    // BullMQ le juge d'un refus métier (job failed, bruit dans les métriques) et
    // ferait perdre la raison, seule chose utile au client.
    if (isFailure(result)) {
      this.logger.log('Reconstruction du graphe sans effet', { accountId, reason: result.problem.message })
      return { ok: false, reason: result.problem.message }
    }

    return { ok: true, matched: result.output.matched, total: result.output.total }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<OrgRebuildJobData> | undefined, err: Error): void {
    this.logger.error('Reconstruction du graphe en échec', {
      jobId: job?.id,
      accountId: job?.data.accountId,
      message: err.message,
    })
  }
}
