import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import type { Queue } from 'bullmq'
import { IsNull, Repository } from 'typeorm'
import { BULK_EXPORT_MAX_ROWS, type AtsExportRow, type BulkExportJobKind } from '@bellum/contracts'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { BulkExportJobEntity } from '../../database/entities/bulk-export-job.entity'
import { toAtsExportRow } from './ats-export'
import { consultantExportRowsToCsv } from './bulk-export-csv'
import { BULK_EXPORT_JOB_OPTIONS, BULK_EXPORT_QUEUE, type BulkExportJobData } from './bulk-export.queue'

/** Une page à la fois — assez grand pour peu d'allers-retours, assez petit pour ne pas gonfler la mémoire du worker. */
const PAGE_SIZE = 500

export type BulkExportJobView = {
  id: string
  status: 'queued' | 'processing' | 'done' | 'failed'
  total: number | null
  processed: number
  rowCount: number | null
  truncated: boolean
  error: string | null
}

function toView(row: BulkExportJobEntity): BulkExportJobView {
  return {
    id: row.id,
    status: row.status,
    total: row.total,
    processed: row.processed_count,
    rowCount: row.row_count,
    truncated: row.row_count !== null && row.total !== null && row.row_count < row.total,
    error: row.error,
  }
}

/**
 * #1952.6 (épopée #2844, lot SRC5 28/09 soir) — L'EXPORT EN LOT COMME JOB.
 *
 * Réutilise EXACTEMENT la ligne de l'export ATS (`toAtsExportRow`, #2326.8) :
 * même colonnes, même règle « disponibilité EFFECTIVE » — ce service ne fait
 * que paginer le vivier ENTIER (jamais borné à `ATS_EXPORT_MAX_ROWS`, plafonné
 * ici à `BULK_EXPORT_MAX_ROWS`) et construire le fichier en tâche de fond.
 */
@Injectable()
export class BulkExportService {
  constructor(
    @InjectRepository(BulkExportJobEntity) private readonly jobs: Repository<BulkExportJobEntity>,
    @InjectRepository(ConsultantEntity) private readonly consultants: Repository<ConsultantEntity>,
    @InjectQueue(BULK_EXPORT_QUEUE) private readonly queue: Queue<BulkExportJobData>,
  ) {}

  async enqueue(workspaceId: string, userId: string, kind: BulkExportJobKind): Promise<BulkExportJobView> {
    const row = await this.jobs.save(
      this.jobs.create({
        workspace_id: workspaceId,
        user_id: userId,
        kind,
        status: 'queued',
        total: null,
        processed_count: 0,
        row_count: null,
        result_csv: null,
        error: null,
      }),
    )
    await this.queue.add('export', { jobId: row.id, workspaceId, kind }, { ...BULK_EXPORT_JOB_OPTIONS, jobId: row.id })
    return toView(row)
  }

  async state(workspaceId: string, jobId: string): Promise<BulkExportJobView> {
    const row = await this.findOwn(workspaceId, jobId)
    return toView(row)
  }

  /** Le fichier fini — un `ConflictException` tant qu'il ne l'est pas, jamais un fichier vide. */
  async download(workspaceId: string, jobId: string): Promise<{ csv: string; fileName: string }> {
    const row = await this.findOwn(workspaceId, jobId)
    if (row.status !== 'done' || row.result_csv === null) {
      throw new ConflictException('bulk_export_job_not_ready')
    }
    return { csv: row.result_csv, fileName: `vivier-${jobId}.csv` }
  }

  /**
   * Pagine le vivier ENTIER (fiches archivées exclues, même règle que
   * `AtsExportService`) et construit le CSV. `onProgress` relaie chaque
   * avancée à la passerelle Socket.IO, best-effort.
   */
  async process(jobId: string, workspaceId: string, onProgress: (view: BulkExportJobView) => void): Promise<void> {
    const row = await this.jobs.findOne({ where: { id: jobId, workspace_id: workspaceId } })
    if (!row) return
    const total = await this.consultants.count({ where: { workspace_id: workspaceId, archived_at: IsNull() } })
    row.status = 'processing'
    row.total = total
    await this.jobs.save(row)
    onProgress(toView(row))

    const now = new Date()
    const capped = Math.min(total, BULK_EXPORT_MAX_ROWS)
    const rows: AtsExportRow[] = []
    for (let offset = 0; offset < capped; offset += PAGE_SIZE) {
      const page = await this.consultants.find({
        where: { workspace_id: workspaceId, archived_at: IsNull() },
        select: [
          'id',
          'full_name',
          'email',
          'phone',
          'title',
          'seniority',
          'availability',
          'availability_checked_at',
          'available_from',
          'tjm',
          'engagement_kind',
          'source',
        ],
        order: { full_name: 'ASC' },
        skip: offset,
        take: Math.min(PAGE_SIZE, capped - offset),
      })
      rows.push(...page.map(consultant => toAtsExportRow(consultant, now)))
      row.processed_count = rows.length
      await this.jobs.save(row)
      onProgress(toView(row))
    }

    row.result_csv = consultantExportRowsToCsv(rows)
    row.row_count = rows.length
    row.status = 'done'
    await this.jobs.save(row)
    onProgress(toView(row))
  }

  async markFailed(workspaceId: string, jobId: string, reason: string): Promise<void> {
    await this.jobs.update({ id: jobId, workspace_id: workspaceId }, { status: 'failed', error: reason })
  }

  private async findOwn(workspaceId: string, jobId: string): Promise<BulkExportJobEntity> {
    const row = await this.jobs.findOne({ where: { id: jobId, workspace_id: workspaceId } })
    if (!row) throw new NotFoundException('bulk_export_job_not_found')
    return row
  }
}
