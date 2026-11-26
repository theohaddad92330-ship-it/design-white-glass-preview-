import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { RfpImportSession, RfpImportSessionStatus, SaveRfpImportSession } from '@bellum/contracts'
import { RfpImportSessionEntity } from '../../database/entities/rfp-import-session.entity'

/**
 * #2957 (#2180.53) — l'import d'appel d'offres INTERROMPABLE ET REPRENABLE.
 *
 * L'espace est RÉSOLU par l'appelant (le contrôleur) et passé en argument : ce
 * service ne dépend d'aucun autre module (GA-07, le compteur ne se relève pas).
 *
 * Une seule session `in_progress` par (espace, personne) : `save` la crée ou la
 * met à jour (l'index unique partiel de la migration la garantit aussi en
 * base), `current` la retrouve, `close` l'ARCHIVE (`confirmed` / `cancelled` —
 * on archive, on ne supprime pas). Jamais un octet de fichier : voir
 * `rfpImportSessionSchema`.
 */
@Injectable()
export class RfpImportSessionService {
  constructor(
    @InjectRepository(RfpImportSessionEntity)
    private readonly sessions: Repository<RfpImportSessionEntity>,
  ) {}

  async save(workspaceId: string, userId: string, input: SaveRfpImportSession): Promise<RfpImportSession> {
    const existing = await this.findInProgress(workspaceId, userId)
    const saved = await this.sessions.save({
      ...(existing ? { id: existing.id } : {}),
      workspace_id: workspaceId,
      user_id: userId,
      status: 'in_progress',
      title: input.title,
      pasted_text: input.pastedText,
      document_names: input.documentNames,
      preview: input.preview,
    })
    return toContract(saved)
  }

  /** La session à reprendre — `null` quand il n'y en a pas, jamais une session fabriquée. */
  async current(workspaceId: string, userId: string): Promise<RfpImportSession | null> {
    const row = await this.findInProgress(workspaceId, userId)
    return row ? toContract(row) : null
  }

  /** Sans session en cours (import direct `POST /rfp`), il n'y a rien à fermer. */
  async close(
    workspaceId: string,
    userId: string,
    status: Exclude<RfpImportSessionStatus, 'in_progress'>,
  ): Promise<void> {
    const row = await this.findInProgress(workspaceId, userId)
    if (!row) return
    await this.sessions.save({ ...row, status })
  }

  private findInProgress(workspaceId: string, userId: string): Promise<RfpImportSessionEntity | null> {
    return this.sessions.findOne({
      where: { workspace_id: workspaceId, user_id: userId, status: 'in_progress' },
      order: { updated_at: 'DESC' },
    })
  }
}

function toContract(row: Partial<RfpImportSessionEntity>): RfpImportSession {
  return {
    id: row.id ?? '',
    status: row.status ?? 'in_progress',
    title: row.title ?? '',
    pastedText: row.pasted_text ?? null,
    documentNames: row.document_names ?? [],
    preview: (row.preview ?? null) as RfpImportSession['preview'],
    updatedAt: (row.updated_at ?? new Date()).toISOString(),
  }
}
