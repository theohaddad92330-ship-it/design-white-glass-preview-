import { randomUUID, createHash } from 'node:crypto'
import { InjectQueue } from '@nestjs/bullmq'
import { BadRequestException, Injectable, PayloadTooLargeException } from '@nestjs/common'
import type { Queue } from 'bullmq'
import {
  cvZipImportRoute,
  type CvBatchImportReport,
  type CvZipImportJobProgress,
  type CvZipImportJobStatus,
  type CvZipLargeImportStart,
  type CvZipLargeUploadTicket,
  type CvZipLargeUploadTicketRequest,
} from '@bellum/contracts'
import { StorageClient } from '../storage/storage.client'
import { CV_ZIP_IMPORT_JOB_OPTIONS, CV_ZIP_IMPORT_QUEUE, type CvZipImportJobData } from './cv-zip-import.queue'

/** États BullMQ qui signifient « pas encore commencé » — même liste que le
 *  dispatcher d'enrichissement contact (`contact-enrichment.service.ts`). */
const QUEUED_STATES = new Set(['waiting', 'waiting-children', 'delayed', 'prioritized'])

/**
 * #3065 (lot 2b) — L'IMPORT ZIP VOLUMINEUX : le ticket d'upload direct vers le
 * stockage, la mise en file du traitement, et son suivi.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UN SERVICE SÉPARÉ DE `CvBatchImportService`
 * ─────────────────────────────────────────────────────────────────────────────
 * L'import EN LIGNE (`importZip`) reçoit déjà les octets, décodés, dans la
 * requête — il n'a besoin d'aucun stockage. Celui-ci ne reçoit JAMAIS les
 * octets : son seul travail est de signer une porte d'écriture, puis de
 * réveiller le worker qui lira l'archive lui-même, en streaming, depuis le
 * stockage. Les deux services partagent le même pipeline en aval
 * (`CvIntakeService.intakeAutomatic`, dans `cv-zip-import.worker.ts`) —
 * jamais une seconde décision d'auto-validation ou d'exception.
 */
@Injectable()
export class CvZipLargeImportService {
  constructor(
    @InjectQueue(CV_ZIP_IMPORT_QUEUE) private readonly queue: Queue<CvZipImportJobData>,
    private readonly storage: StorageClient,
  ) {}

  /**
   * Le chemin est bâti ICI, jamais choisi par le client : un identifiant tiré
   * au hasard, sous l'espace — même discipline de cloisonnement que
   * `storageObjectPath` (l'espace en premier segment, un identifiant deviné
   * ne donne accès qu'à ce qu'on avait déjà).
   */
  async createUploadTicket(workspaceId: string, input: CvZipLargeUploadTicketRequest): Promise<CvZipLargeUploadTicket> {
    const route = cvZipImportRoute(input.byteSize)
    if (route === 'inline') {
      throw new BadRequestException(
        'Cette archive tient dans un envoi direct — l’import volumineux ne lui apporte rien.',
      )
    }
    if (route === 'refused') {
      throw new PayloadTooLargeException(
        'Cette archive dépasse le plafond de l’import volumineux — découpe-la en plusieurs envois plus petits.',
      )
    }
    const path = `${workspaceId}/cv-zip-import/${randomUUID()}.zip`
    const { uploadUrl, token } = await this.storage.createSignedUploadUrl(path)
    return {
      uploadUrl,
      path,
      token,
      bucket: this.storage.bucket(),
      resumableEndpoint: this.storage.resumableUploadEndpoint(),
    }
  }

  /**
   * Un job par CHEMIN déposé — deux clics sur « confirmer » (ou deux onglets)
   * après le même upload partagent le même job, jamais deux traitements
   * concurrents de la même archive.
   *
   * ⚠️ AUCUN `:` dans le jobId — BullMQ l'utilise comme séparateur de clés
   * Redis (même piège déjà écrit sur `contactEnrichmentJobId`).
   */
  async start(
    workspaceId: string,
    userId: string,
    input: CvZipLargeImportStart,
  ): Promise<{ job_id: string; state: 'queued' | 'running' }> {
    const jobId = cvZipImportJobId(input.path)
    const existing = await this.queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      if (state === 'active') return { job_id: jobId, state: 'running' }
      if (QUEUED_STATES.has(state)) return { job_id: jobId, state: 'queued' }
      // Terminé (completed/failed) : la place est libérée pour cette tentative.
      await existing.remove()
    }

    await this.queue.add(
      'cv-zip-import',
      { workspaceId, userId, path: input.path, filename: input.filename },
      { ...CV_ZIP_IMPORT_JOB_OPTIONS, jobId },
    )
    return { job_id: jobId, state: 'queued' }
  }

  /**
   * L'état du job, borné à CET espace : un identifiant deviné d'un autre
   * espace ne rend rien de plus qu'un identifiant qui n'existe pas — même
   * défense en profondeur que `StorageService.findInWorkspace`.
   */
  async status(workspaceId: string, jobId: string): Promise<CvZipImportJobStatus> {
    const job = await this.queue.getJob(jobId)
    if (!job || job.data.workspaceId !== workspaceId) return { state: 'unknown', jobId }

    const state = await job.getState()
    if (state === 'active') {
      return { state: 'running', jobId, progress: progressOf(job.progress) }
    }
    if (QUEUED_STATES.has(state)) return { state: 'queued', jobId }

    if (state === 'completed') {
      const result = job.returnvalue as CvBatchImportReport
      return { state: 'done', jobId, result }
    }

    return { state: 'failed', jobId, reason: job.failedReason ?? 'Échec inconnu.' }
  }
}

/** Dérivé du CHEMIN plutôt que tiré au hasard à nouveau : deux démarrages sur
 *  le même dépôt retrouvent le même job. Un hachage court plutôt que le
 *  chemin lui-même — BullMQ rejette un `:` dans un jobId, et un chemin encode
 *  le nom du FICHIER, qui n'a pas sa place dans une clé Redis. */
export function cvZipImportJobId(path: string): string {
  return `cv-zip-${createHash('sha1').update(path).digest('hex').slice(0, 20)}`
}

function progressOf(raw: unknown): CvZipImportJobProgress | null {
  if (!raw || typeof raw !== 'object') return null
  const candidate = raw as Partial<CvZipImportJobProgress>
  if (typeof candidate.processed !== 'number') return null
  const total = typeof candidate.total === 'number' ? candidate.total : null
  const progress: CvZipImportJobProgress = { processed: candidate.processed, total }
  // Incident boucle API (05/10/2026) — la phase et les octets reçus, relayés
  // seulement quand ils ont la forme attendue : jamais une valeur inventée.
  if (candidate.phase !== undefined && CV_ZIP_IMPORT_PHASES.has(candidate.phase)) {
    progress.phase = candidate.phase
    if (typeof candidate.bytesDownloaded === 'number') progress.bytesDownloaded = candidate.bytesDownloaded
    if (typeof candidate.bytesTotal === 'number' || candidate.bytesTotal === null)
      progress.bytesTotal = candidate.bytesTotal
  }
  return progress
}

const CV_ZIP_IMPORT_PHASES = new Set<string>(['download', 'open', 'entries'])
