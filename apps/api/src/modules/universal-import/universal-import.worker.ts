import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable, Logger, Optional } from '@nestjs/common'
import type { Job } from 'bullmq'
import { Correlated } from '../../correlation-id/background-correlation'
import { UniversalImportGateway } from './universal-import.gateway'
import { UNIVERSAL_IMPORT_QUEUE, type UniversalImportJobData } from './universal-import.queue'
import { UniversalImportService } from './universal-import.service'

/**
 * Un import à la fois par instance : un paquet est déjà une transaction de 500
 * lignes, en superposer deux doublerait la pression sur la base sans finir
 * plus tôt le fichier d'un client. `lockDuration` couvre un paquet lent.
 */
const WORKER_OPTIONS = { concurrency: 1, lockDuration: 300_000 }

/**
 * L'orchestrateur asynchrone de l'import universel. Aucune logique ici : le
 * service lit en flux, applique paquet par paquet, et ce worker pousse chaque
 * avancée sur la passerelle Socket.IO.
 */
@Processor(UNIVERSAL_IMPORT_QUEUE, WORKER_OPTIONS)
@Injectable()
export class UniversalImportWorker extends WorkerHost {
  private readonly logger = new Logger(UniversalImportWorker.name)

  constructor(
    private readonly imports: UniversalImportService,
    @Optional() private readonly gateway?: UniversalImportGateway,
  ) {
    super()
  }

  @Correlated('worker:universal-import')
  async process(job: Job<UniversalImportJobData>): Promise<{ ok: boolean }> {
    const { jobId, workspaceId } = job.data
    const ok = await this.imports.process(workspaceId, jobId, state => this.gateway?.emitProgress(state))
    if (!ok) this.logger.warn(`Import universel introuvable, abandonné (${jobId})`)
    return { ok }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<UniversalImportJobData> | undefined, err: Error): Promise<void> {
    if (!job?.data.jobId) return
    // Le message d'une erreur de base peut CITER une valeur (« Key (email)=(…) ») :
    // il ne part ni au journal ni à l'écran. Seul son nom technique voyage.
    this.logger.error('Import universel : tentative en échec', { jobId: job.data.jobId, name: err.name })
    if ((job.attemptsMade ?? 0) < (job.opts.attempts ?? 1)) return
    await this.imports.markFailed(job.data.workspaceId, job.data.jobId, `interrupted:${err.name}`)
    this.gateway?.emitProgress(await this.imports.state(job.data.workspaceId, job.data.jobId))
  }
}
