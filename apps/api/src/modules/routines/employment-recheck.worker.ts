import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { type Job } from 'bullmq'
import { Correlated } from '../../correlation-id/background-correlation'
import { EMPLOYMENT_RECHECK_QUEUE, type EmploymentRecheckJobData } from './employment-check'
import { RoutineExecutors } from './routine-executors'

/**
 * #4286.13 — exécute la relecture d'employeur demandée par l'ouverture d'une fiche.
 *
 * Aucune logique ici : le worker appelle {@link RoutineExecutors.recheckContactEmployment}, c'est-à-dire la MÊME
 * relecture que la routine mensuelle (annuaire gratuit, « vu le », signal, porte, pause). Un annuaire se relit, il ne
 * se martèle pas : concurrence 2, jamais de retry.
 */
@Processor(EMPLOYMENT_RECHECK_QUEUE, { concurrency: 2 })
@Injectable()
export class EmploymentRecheckWorker extends WorkerHost {
  constructor(private readonly executors: RoutineExecutors) {
    super()
  }

  @Correlated('worker:employment-recheck')
  async process(job: Job<EmploymentRecheckJobData>): Promise<void> {
    await this.executors.recheckContactEmployment(job.data.workspaceId, job.data.contactId)
  }
}
