import { Injectable, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import {
  contextPackOriginalOf,
  cvBatchBreakdown,
  documentUploadBreakdown,
  summariseCvBatchImport,
  type ContextPackHistoryItem,
  type ContextPackRecordRequest,
} from '@bellum/contracts'
import { Repository } from 'typeorm'
import { ContextPackImportEntity } from '../../database/entities/context-pack-import.entity'
import { CvBatchImportJobEntity } from '../../database/entities/cv-batch-import-job.entity'
import { ContextPackOriginalsService } from './context-pack-originals.service'

const HISTORY_LIMIT = 20

/**
 * #4422.1 — l'historique des imports de l'assistant « Dépose tes documents » (postes cibles, grille, séquences,
 * connaissances). Les comptes passent par un job universel : l'historique de /settings/import les liste déjà.
 *
 * ⚠️ Ne journalise AUCUNE cellule : une ligne = un nom de fichier, une destination, des compteurs.
 */
@Injectable()
export class ContextPackHistoryService {
  constructor(
    @InjectRepository(ContextPackImportEntity) private readonly rows: Repository<ContextPackImportEntity>,
    @Optional() @InjectRepository(CvBatchImportJobEntity) private readonly cvJobs?: Repository<CvBatchImportJobEntity>,
    /** #4573 — l'original du dépôt (seau privé). Absent : la ligne s'écrit comme avant, sans état d'original. */
    @Optional() private readonly originals?: ContextPackOriginalsService,
  ) {}

  /**
   * #4573 — l'original est rangé AU DÉPÔT, sous l'id de la ligne qui le désignera (tiré ici, avant l'écriture) ; une
   * ligne qui ne s'écrit pas emporte aussitôt son original — un objet que rien ne désigne serait orphelin.
   */
  async record(workspaceId: string, userId: string, input: ContextPackRecordRequest): Promise<void> {
    const id = randomUUID()
    const original = this.originals ? await this.originals.keep(workspaceId, id, input) : null
    try {
      await this.save(workspaceId, userId, id, input, original ?? {})
    } catch (error) {
      await this.originals?.discard(original?.original_storage_path ?? null)
      throw error
    }
  }

  private async save(
    workspaceId: string,
    userId: string,
    id: string,
    input: ContextPackRecordRequest,
    original: Partial<ContextPackImportEntity>,
  ): Promise<void> {
    await this.rows.save(
      this.rows.create({
        id,
        workspace_id: workspaceId,
        user_id: userId,
        file_name: input.fileName,
        destination: input.destination,
        status: input.status,
        imported: input.imported,
        skipped: input.skipped,
        scripts: input.scripts,
        message: input.message,
        ...original,
      }),
    )
  }

  /**
   * #AM.11 (#4290.6) — l'historique MULTI-LOTS : les imports de l'assistant (documents compris, avec leur bilan
   * « documents ») et les lots de CV (autre chaîne, `cv_batch_import_jobs`, avec leur bilan « CV »). Une seule route,
   * celle qui existe. Un lot de CV encore en cours ne fait aucune ligne : on n'affiche pas ce qui n'est pas fini.
   */
  async list(workspaceId: string): Promise<ContextPackHistoryItem[]> {
    const rows = await this.rows.find({
      where: { workspace_id: workspaceId },
      order: { created_at: 'DESC' },
      take: HISTORY_LIMIT,
    })
    const items: ContextPackHistoryItem[] = rows.map(row => ({
      id: row.id,
      fileName: row.file_name,
      destination: row.destination,
      status: row.status,
      imported: row.imported ?? null,
      skipped: row.skipped ?? 0,
      scripts: row.scripts ?? null,
      message: row.message ?? null,
      createdAt: new Date(row.created_at).toISOString(),
      // #4573 — l'ÉTAT de l'original (jamais son chemin) ; une ligne d'avant dit « antérieur ».
      original: contextPackOriginalOf(row.original_status),
      // #AM.11 — un document indexé se compte « documents » ; les autres destinations n'ont pas de famille.
      ...(row.destination === 'knowledge' && row.imported !== null && row.imported !== undefined
        ? { breakdown: documentUploadBreakdown({ done: row.imported, failed: row.skipped ?? 0 }) }
        : {}),
    }))
    const cvJobs =
      (await this.cvJobs?.find({
        where: { workspace_id: workspaceId },
        order: { created_at: 'DESC' },
        take: HISTORY_LIMIT,
      })) ?? []
    for (const job of cvJobs) {
      if (job.status !== 'done' && job.status !== 'failed') continue
      const summary = summariseCvBatchImport(job.outcomes ?? [])
      items.push({
        id: job.id,
        fileName: job.outcomes?.[0]?.file ?? `cv-${job.kind}`,
        destination: 'cv',
        status: job.status,
        imported: summary.created + summary.auto_updated,
        skipped: summary.exception + summary.too_big + summary.failed,
        scripts: null,
        message: job.error ?? null,
        createdAt: new Date(job.created_at).toISOString(),
        breakdown: cvBatchBreakdown(summary),
      })
    }
    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, HISTORY_LIMIT)
  }
}
