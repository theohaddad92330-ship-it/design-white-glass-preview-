import { createHash } from 'node:crypto'
import { InjectQueue } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import type { Queue } from 'bullmq'
import {
  ragZipReportStatus,
  type RagDocumentScope,
  type RagZipIngestJobStart,
  type RagZipIngestJobStatus,
  type RagZipIngestReport,
} from '@bellum/contracts'
import { RAG_ZIP_INGEST_JOB_OPTIONS, RAG_ZIP_INGEST_QUEUE, type RagZipIngestJobData } from './rag-zip-ingest.queue'

/** États BullMQ qui signifient « pas encore commencé ». */
const QUEUED_STATES = new Set(['waiting', 'waiting-children', 'delayed', 'prioritized'])

type EnqueueOptions = { category?: string; scope?: RagDocumentScope; conversationId?: string; accountId?: string }

/**
 * #3623.11 / #3666.10 — la porte d'entrée asynchrone de l'ingestion d'archive :
 * `POST ingest/zip` n'ouvre PLUS l'archive (incident API du 05/10/2026). Elle la
 * met en file, rend un identifiant, et l'état se lit ensuite. Le dépaquetage est
 * le travail de `RagZipIngestWorker`.
 */
@Injectable()
export class RagZipIngestJobService {
  constructor(@InjectQueue(RAG_ZIP_INGEST_QUEUE) private readonly queue: Queue<RagZipIngestJobData>) {}

  async enqueue(
    userId: string,
    workspaceId: string,
    fileB64: string,
    options: EnqueueOptions & { filename?: string },
  ): Promise<RagZipIngestJobStart> {
    const jobId = ragZipIngestJobId(workspaceId, fileB64, options)
    const existing = await this.queue.getJob(jobId)
    if (existing) {
      const state = await existing.getState()
      // Reprise sans double traitement : la même archive, déjà en file ou en
      // cours, partage le même job.
      if (state === 'active') return { jobId, status: 'running' }
      if (QUEUED_STATES.has(state)) return { jobId, status: 'pending' }
      // Terminé (réussi ou non) : la place est libérée pour cette nouvelle tentative.
      await existing.remove()
    }
    await this.queue.add(
      'rag-zip-ingest',
      {
        workspaceId,
        userId,
        fileB64,
        filename: options.filename ?? 'archive.zip',
        category: options.category,
        scope: options.scope,
        conversationId: options.conversationId,
        accountId: options.accountId,
      },
      { ...RAG_ZIP_INGEST_JOB_OPTIONS, jobId },
    )
    return { jobId, status: 'pending' }
  }

  /** Borné à CET espace : l'identifiant d'un autre espace ne rend rien de plus qu'un inconnu. */
  async status(workspaceId: string, jobId: string): Promise<RagZipIngestJobStatus> {
    const job = await this.queue.getJob(jobId)
    if (!job || job.data.workspaceId !== workspaceId) return { jobId, status: 'unknown' }
    const state = await job.getState()
    if (state === 'active') {
      const progress = progressOf(job.progress)
      return progress ? { jobId, status: 'running', progress } : { jobId, status: 'running' }
    }
    if (QUEUED_STATES.has(state)) return { jobId, status: 'pending' }
    if (state === 'completed') {
      const report = job.returnvalue as RagZipIngestReport
      return { jobId, status: ragZipReportStatus(report), report }
    }
    return { jobId, status: 'interrupted', reason: job.failedReason ?? 'Échec inconnu.' }
  }
}

/** Dérivé du CONTENU et de l'espace : deux envois de la même archive partagent le job.
 *  Aucun `:` — BullMQ s'en sert comme séparateur de clés Redis. */
export function ragZipIngestJobId(workspaceId: string, fileB64: string, options: EnqueueOptions): string {
  const hash = createHash('sha256')
    .update(workspaceId)
    .update('\0')
    .update(options.scope ?? '')
    .update('\0')
    .update(options.accountId ?? '')
    .update('\0')
    .update(options.conversationId ?? '')
    .update('\0')
    .update(fileB64)
    .digest('hex')
    .slice(0, 32)
  return `rag-zip-${hash}`
}

function progressOf(raw: unknown): { processed: number; total: number | null } | null {
  if (!raw || typeof raw !== 'object') return null
  const candidate = raw as { processed?: unknown; total?: unknown }
  if (typeof candidate.processed !== 'number') return null
  return { processed: candidate.processed, total: typeof candidate.total === 'number' ? candidate.total : null }
}
