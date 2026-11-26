import { Processor, WorkerHost } from '@nestjs/bullmq'
import { Injectable } from '@nestjs/common'
import { type Job } from 'bullmq'
import type { RagZipIngestReport } from '@bellum/contracts'
import { Correlated } from '../../correlation-id/background-correlation'
import { RAG_ZIP_INGEST_QUEUE, type RagZipIngestJobData } from './rag-zip-ingest.queue'
import { RagZipIngestService } from './rag-zip-ingest.service'

// Une archive à la fois par processus : le dépaquetage garde les octets en mémoire.
const WORKER_OPTIONS = { concurrency: 1, lockDuration: 10 * 60_000 }

/**
 * #3623.11 / #3666.10 — le travail que `POST ingest/zip` ne fait plus dans la
 * requête : dépaquetage, plafonds, ingestion entrée par entrée (le MÊME
 * `RagZipIngestService`). Un refus en bloc ou une archive illisible LÈVE : le
 * job passe `failed`, sa raison nommée est relue par le statut (« interrompue »).
 */
@Processor(RAG_ZIP_INGEST_QUEUE, WORKER_OPTIONS)
@Injectable()
export class RagZipIngestWorker extends WorkerHost {
  constructor(private readonly zip: RagZipIngestService) {
    super()
  }

  @Correlated('worker:rag-zip-ingest')
  async process(job: Job<RagZipIngestJobData>): Promise<RagZipIngestReport> {
    const { userId, workspaceId, fileB64, category, scope, conversationId, accountId } = job.data
    try {
      return await this.zip.ingestZip(
        userId,
        workspaceId,
        fileB64,
        { category, scope, conversationId, accountId },
        progress => job.updateProgress(progress),
      )
    } finally {
      // Les octets de l'archive n'ont pas à rester dans Redis pendant les 24 h
      // où le résultat reste lisible.
      await job.updateData({ ...job.data, fileB64: '' })
    }
  }
}
