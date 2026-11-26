import { InjectQueue } from '@nestjs/bullmq'
import { Injectable, Logger } from '@nestjs/common'
import type { Job, Queue } from 'bullmq'
import type { CrmFirstImportState, CrmProvider } from '@bellum/contracts'
import {
  CRM_FIRST_IMPORT_DEADLINE_MS,
  CRM_FIRST_IMPORT_QUEUE,
  CRM_FIRST_IMPORT_RETRY_MS,
  crmFirstImportJobId,
  type CrmFirstImportJobData,
} from './crm-first-import.queue'

const LIVE_STATES = new Set(['waiting', 'active', 'delayed', 'prioritized', 'waiting-children'])

type FirstImportQueue = Pick<Queue<CrmFirstImportJobData>, 'add' | 'getJob'>

function queuedState(provider: CrmProvider): CrmFirstImportState {
  return {
    provider,
    state: 'queued',
    startedAt: null,
    finishedAt: null,
    message: null,
    reconnectNeeded: false,
    objects: [],
  }
}

/**
 * SYNC-B — met en file la première reprise d'un CRM au branchement. Ne lève JAMAIS : le callback OAuth
 * répond tout de suite et sa redirection ne dépend pas de Redis.
 */
@Injectable()
export class CrmFirstImportEnqueuer {
  private readonly logger = new Logger(CrmFirstImportEnqueuer.name)

  constructor(@InjectQueue(CRM_FIRST_IMPORT_QUEUE) private readonly queue: FirstImportQueue) {}

  async enqueue(data: CrmFirstImportJobData): Promise<'queued' | 'already_running' | 'failed'> {
    const jobId = crmFirstImportJobId(data.workspaceId, data.provider)
    try {
      const existing = await this.queue.getJob(jobId)
      if (existing) {
        if (LIVE_STATES.has(await existing.getState())) return 'already_running'
        // Une reprise terminée ne bloque pas un rebranchement : on la remplace.
        await existing.remove()
      }
      await this.queue.add('first-import', data, { jobId })
      return 'queued'
    } catch (error) {
      this.logger.warn(`Première reprise ${data.provider} non mise en file`, {
        error: error instanceof Error ? error.message : String(error),
      })
      return 'failed'
    }
  }

  /**
   * CRM-SYNC-D.1 — le RATTRAPAGE : la passe périodique trouve un CRM branché sans curseur (branché avant SYNC-B,
   * ou reprise tombée). Même file, même verrou (espace, CRM) que `enqueue` ; en plus, un job TERMINÉ (échec ou
   * non) depuis moins d'une heure fait reculer : une reprise en échec se reprend au plus une fois par heure,
   * son erreur reste lisible sur la carte (`states`) jusque-là. Ne lève jamais.
   */
  async enqueueCatchUp(
    data: CrmFirstImportJobData,
    now = Date.now(),
  ): Promise<'queued' | 'already_running' | 'backoff' | 'failed'> {
    const jobId = crmFirstImportJobId(data.workspaceId, data.provider)
    try {
      const existing = await this.queue.getJob(jobId)
      if (existing) {
        if (LIVE_STATES.has(await existing.getState())) return 'already_running'
        if (typeof existing.finishedOn === 'number' && now - existing.finishedOn < CRM_FIRST_IMPORT_RETRY_MS)
          return 'backoff'
        await existing.remove()
      }
      await this.queue.add('first-import', data, { jobId })
      return 'queued'
    } catch (error) {
      this.logger.warn(`Rattrapage de la première reprise ${data.provider} non mis en file`, {
        error: error instanceof Error ? error.message : String(error),
      })
      return 'failed'
    }
  }

  /** L'état de chaque CRM demandé qui a (eu) une reprise. Un CRM sans job n'a pas de ligne. */
  async states(
    workspaceId: string,
    providers: readonly CrmProvider[],
    now = Date.now(),
  ): Promise<CrmFirstImportState[]> {
    const states: CrmFirstImportState[] = []
    for (const provider of providers) {
      const job = await this.queue.getJob(crmFirstImportJobId(workspaceId, provider))
      if (job) states.push(await this.stateOf(job, provider, now))
    }
    return states
  }

  private async stateOf(
    job: Job<CrmFirstImportJobData>,
    provider: CrmProvider,
    now: number,
  ): Promise<CrmFirstImportState> {
    const jobState = await job.getState()
    if (jobState === 'completed' && isState(job.returnvalue)) return job.returnvalue
    if (jobState === 'failed') {
      return {
        ...queuedState(provider),
        state: 'failed',
        message: job.failedReason || 'La reprise a échoué.',
      }
    }
    const progress = isState(job.progress) ? job.progress : queuedState(provider)
    // Un job « en cours » dont le travailleur est mort ne tourne pas à l'infini à l'écran.
    const started = progress.startedAt ? Date.parse(progress.startedAt) : Number.NaN
    if (progress.state === 'running' && Number.isFinite(started) && now - started > CRM_FIRST_IMPORT_DEADLINE_MS * 2) {
      return { ...progress, state: 'failed', message: 'La reprise a dépassé le délai maximal.' }
    }
    return jobState === 'active'
      ? progress
      : { ...progress, state: progress.state === 'running' ? 'running' : 'queued' }
  }
}

function isState(value: unknown): value is CrmFirstImportState {
  return typeof value === 'object' && value !== null && 'state' in value && 'provider' in value && 'objects' in value
}
