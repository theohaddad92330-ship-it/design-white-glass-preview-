import { Injectable, NotFoundException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import type { StoredFile } from '@bellum/contracts'

/**
 * #2814 — LES PIÈCES JOINTES d'une facture PRÉPARÉE : le LIEN entre une
 * mission, un mois (`AAAA-MM-01`) et un objet rangé.
 *
 * Ce service ne connaît que la table `invoice_attachments` — jamais le
 * stockage lui-même : l'orchestration (déposer les octets, puis le lien ; les
 * reprendre si le lien échoue) vit dans le CONTRÔLEUR, la couche où un geste
 * traverse légitimement deux modules (GA-07, §3.2).
 *
 * Il n'émet aucune facture, il n'envoie rien, il n'écrit rien chez un
 * connecteur (« préparée » ≠ « créée » ≠ « envoyée »).
 *
 * ⚠️ TOUTE requête porte `workspace_id` : une mission ou un lien d'un autre
 * espace n'existe pas ici (404 muet — un 404 bavard est un annuaire).
 */
@Injectable()
export class InvoiceAttachmentsService {
  constructor(private readonly dataSource: DataSource) {}

  /** La mission existe-t-elle DANS cet espace ? Sinon 404, avant tout octet. */
  async assertMission(workspaceId: string, missionId: string): Promise<void> {
    const rows = await this.dataSource.query<{ id: string }[]>(
      `SELECT id FROM missions WHERE id = $1 AND workspace_id = $2 LIMIT 1`,
      [missionId, workspaceId],
    )
    if (rows.length === 0) throw new NotFoundException('Mission introuvable dans cet espace.')
  }

  /** Les pièces de CE mois de CETTE mission, dans l'ordre du dépôt. */
  async list(workspaceId: string, missionId: string, periodMonth: string): Promise<StoredFile[]> {
    await this.assertMission(workspaceId, missionId)
    // La jointure est bornée DES DEUX CÔTÉS. Jointure INTERNE : une pièce
    // purgée à échéance (`storage_object_id` à NULL) n'offre plus de bouton.
    const rows = await this.dataSource.query<AttachmentRow[]>(
      `SELECT ia.id, so.file_name, so.content_type, so.byte_size, so.retention_until, ia.created_at
         FROM invoice_attachments ia
         JOIN storage_objects so ON so.id = ia.storage_object_id AND so.workspace_id = ia.workspace_id
        WHERE ia.workspace_id = $1 AND ia.mission_id = $2 AND ia.period_month = $3::date
        ORDER BY ia.created_at ASC`,
      [workspaceId, missionId, periodMonth],
    )
    return rows.map(row => ({
      id: row.id,
      fileName: row.file_name,
      contentType: row.content_type,
      byteSize: Number(row.byte_size),
      retentionUntil:
        typeof row.retention_until === 'string'
          ? row.retention_until.slice(0, 10)
          : row.retention_until.toISOString().slice(0, 10),
      uploadedAt: new Date(row.created_at).toISOString(),
      downloadPath: invoiceAttachmentDownloadPath(missionId, periodMonth, row.id),
    }))
  }

  /** Écrit le LIEN d'un objet qui vient d'être rangé. */
  async link(input: {
    workspaceId: string
    missionId: string
    periodMonth: string
    userId: string
    stored: Omit<StoredFile, 'downloadPath'>
  }): Promise<StoredFile> {
    const [row] = await this.dataSource.query<{ id: string }[]>(
      `INSERT INTO invoice_attachments (workspace_id, mission_id, period_month, storage_object_id, file_name, created_by)
       VALUES ($1, $2, $3::date, $4, $5, $6)
       RETURNING id`,
      [input.workspaceId, input.missionId, input.periodMonth, input.stored.id, input.stored.fileName, input.userId],
    )
    if (!row) throw new Error('invoice_attachments: aucune ligne rendue par l’insertion')
    return {
      ...input.stored,
      id: row.id,
      downloadPath: invoiceAttachmentDownloadPath(input.missionId, input.periodMonth, row.id),
    }
  }

  /** L'objet rangé derrière une pièce de CET espace — 404 sinon. */
  async objectIdOf(workspaceId: string, missionId: string, periodMonth: string, attachmentId: string): Promise<string> {
    const [row] = await this.dataSource.query<{ storage_object_id: string | null }[]>(
      `SELECT storage_object_id FROM invoice_attachments
        WHERE workspace_id = $1 AND mission_id = $2 AND period_month = $3::date AND id = $4`,
      [workspaceId, missionId, periodMonth, attachmentId],
    )
    if (!row?.storage_object_id) throw new NotFoundException('Pièce introuvable pour cette facture.')
    return row.storage_object_id
  }

  /** Retire le LIEN — après les octets (la ligne porte la référence). */
  async unlink(workspaceId: string, attachmentId: string): Promise<void> {
    await this.dataSource.query(`DELETE FROM invoice_attachments WHERE id = $1 AND workspace_id = $2`, [
      attachmentId,
      workspaceId,
    ])
  }
}

function invoiceAttachmentDownloadPath(missionId: string, periodMonth: string, attachmentId: string): string {
  return `/delivery/invoice-attachments/${missionId}/${periodMonth}/${attachmentId}/download`
}

type AttachmentRow = {
  id: string
  file_name: string
  content_type: string
  byte_size: string | number
  retention_until: string | Date
  created_at: string | Date
}
