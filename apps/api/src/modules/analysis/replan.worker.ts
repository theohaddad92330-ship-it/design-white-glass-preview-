import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import { type Job } from 'bullmq'
import { isFailure } from '@bellum/utils'
import { AnalysisOnDemandService } from './analysis-ondemand.service'
import { REPLAN_QUEUE, type ReplanJobData, type ReplanJobResult } from './replan.queue'
import { Correlated } from '../../correlation-id/background-correlation'

/**
 * Quelques re-planifications à la fois — ce sont des clics d'utilisateurs, pas
 * une tâche de fond. Le verrou dure plus longtemps que le pire cas mesuré
 * (le budget de la phase 4 est de 300 s) : un job lent-mais-vivant déclaré perdu
 * verrait son plan calculé, payé, puis jeté.
 */
const WORKER_OPTIONS = {
  concurrency: 2,
  lockDuration: 360_000,
}

/**
 * Exécute une re-planification mise en file.
 *
 * Aucune logique métier ici : le worker appelle
 * {@link AnalysisOnDemandService.replan}, c'est-à-dire EXACTEMENT le chemin qui
 * servait la requête synchrone. Profil ESN, mémoire de corrections, couche zéro,
 * écriture du plan : tout reste là-bas, en un seul exemplaire.
 */
@Processor(REPLAN_QUEUE, WORKER_OPTIONS)
@Injectable()
export class ReplanWorker extends WorkerHost {
  private readonly logger = new Logger(ReplanWorker.name)

  constructor(private readonly onDemand: AnalysisOnDemandService) {
    super()
  }

  @Correlated('worker:account-replan')
  async process(job: Job<ReplanJobData>): Promise<ReplanJobResult> {
    const { accountId, userId, strategy } = job.data

    const result = await this.onDemand.replan(accountId, userId, strategy)

    // Un « non » motivé est une RÉPONSE, pas un incident : on le rend en valeur,
    // pour que le client garde le `code` typé et son message localisé.
    if (isFailure(result)) {
      this.logger.log('Replan job finished without replanning', { accountId, code: result.problem.code })
      return { ok: false, failure: result.problem }
    }

    return { ok: true }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<ReplanJobData> | undefined, err: Error): void {
    this.logger.error('Replan job crashed', {
      jobId: job?.id,
      accountId: job?.data.accountId,
      message: err.message,
    })
  }
}
