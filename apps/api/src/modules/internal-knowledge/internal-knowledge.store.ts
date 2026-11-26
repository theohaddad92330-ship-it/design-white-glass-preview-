import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource } from 'typeorm'
import { normalizeText } from './text-normalize'
import type {
  DigestStore,
  KnowledgeDigest,
  KnowledgeFileRow,
  KnowledgeFileStatus,
  KnowledgeStore,
  KnowledgeSyncState,
} from './internal-knowledge.types'

/** `type_chunk` des chunks nés du Drive interne — distinct des types ORION (`GARDE_FOU_QUALITE`…). */
const DRIVE_CHUNK_TYPE = 'DRIVE_INTERNE'
const DATA_VERSION = 'drive-interne'
const STATE_ID = 'drive'

type FileSqlRow = {
  file_id: string
  name: string
  mime_type: string
  path: string
  modified_time: string
  status: KnowledgeFileStatus
  error_message: string | null
  chunk_count: number
  synced_at: Date
}

function toFileRow(r: FileSqlRow): KnowledgeFileRow {
  return {
    fileId: r.file_id,
    name: r.name,
    mimeType: r.mime_type,
    path: r.path,
    modifiedTime: r.modified_time,
    status: r.status,
    errorMessage: r.error_message,
    chunkCount: r.chunk_count,
    syncedAt: r.synced_at,
  }
}

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

/**
 * #3586 — Postgres refuse \u0000 (« invalid byte sequence for encoding "UTF8" ») dans TOUT texte, pas seulement le
 * contenu des chunks : titre, chemin, message d'erreur, état, digest. Point d'écriture UNIQUE : chaque paramètre
 * texte de chaque requête du store passe ici, quel que soit l'appelant.
 */
function cleanParams(params?: unknown[]): unknown[] | undefined {
  return params?.map(p => (typeof p === 'string' ? normalizeText(p) : p))
}

function cleanQueryable(q: Queryable): Queryable {
  return { query: (sql, params) => q.query(sql, cleanParams(params)) }
}

/** #3586.5 — SQL du stockage : corpus partagé `dataforge_rag_chunks` + les deux tables d'état (migration 1796431247953). */
@Injectable()
export class InternalKnowledgeStore implements KnowledgeStore, DigestStore {
  constructor(@InjectDataSource() private readonly rawDataSource: DataSource) {}

  /** Toute écriture passe par ici : les paramètres texte sont normalisés (#3586). */
  private get dataSource(): Queryable & { transaction: <T>(fn: (m: Queryable) => Promise<T>) => Promise<T> } {
    const raw = this.rawDataSource
    return {
      ...cleanQueryable(raw),
      transaction: fn => raw.transaction(manager => fn(cleanQueryable(manager))),
    }
  }

  async getState(): Promise<KnowledgeSyncState> {
    const rows = await this.dataSource.query(
      `SELECT page_token, last_run_at, last_status, last_error, last_reconciled_at FROM internal_knowledge_sync_state WHERE id = $1`,
      [STATE_ID],
    )
    const r = (
      rows as Array<{
        page_token: string | null
        last_run_at: Date | null
        last_status: 'ok' | 'error' | null
        last_error: string | null
        last_reconciled_at: Date | null
      }>
    )[0]
    return {
      pageToken: r?.page_token ?? null,
      lastRunAt: r?.last_run_at ?? null,
      lastStatus: r?.last_status ?? null,
      lastError: r?.last_error ?? null,
      lastReconciledAt: r?.last_reconciled_at ?? null,
    }
  }

  async saveState(patch: Partial<KnowledgeSyncState>): Promise<void> {
    const current = await this.getState()
    const next = { ...current, ...patch }
    await this.dataSource.query(
      `INSERT INTO internal_knowledge_sync_state (id, page_token, last_run_at, last_status, last_error, last_reconciled_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET page_token = EXCLUDED.page_token, last_run_at = EXCLUDED.last_run_at,
         last_status = EXCLUDED.last_status, last_error = EXCLUDED.last_error,
         last_reconciled_at = EXCLUDED.last_reconciled_at`,
      [STATE_ID, next.pageToken, next.lastRunAt, next.lastStatus, next.lastError, next.lastReconciledAt],
    )
  }

  async getFile(fileId: string): Promise<KnowledgeFileRow | null> {
    const rows = await this.dataSource.query(`SELECT * FROM internal_knowledge_files WHERE file_id = $1`, [fileId])
    const r = (rows as FileSqlRow[])[0]
    return r ? toFileRow(r) : null
  }

  async upsertFile(row: KnowledgeFileRow): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO internal_knowledge_files (file_id, name, mime_type, path, modified_time, status, error_message, chunk_count, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (file_id) DO UPDATE SET name = EXCLUDED.name, mime_type = EXCLUDED.mime_type, path = EXCLUDED.path,
         modified_time = EXCLUDED.modified_time, status = EXCLUDED.status, error_message = EXCLUDED.error_message,
         chunk_count = EXCLUDED.chunk_count, synced_at = EXCLUDED.synced_at`,
      [
        row.fileId,
        row.name,
        row.mimeType,
        row.path,
        row.modifiedTime,
        row.status,
        row.errorMessage,
        row.chunkCount,
        row.syncedAt,
      ],
    )
  }

  async listFiles(): Promise<KnowledgeFileRow[]> {
    const rows = await this.dataSource.query(`SELECT * FROM internal_knowledge_files ORDER BY synced_at DESC`)
    return (rows as FileSqlRow[]).map(toFileRow)
  }

  async replaceChunks(
    file: { fileId: string; name: string; path: string; modifiedTime: string },
    chunks: string[],
  ): Promise<number> {
    await this.dataSource.transaction(async manager => {
      await manager.query(
        `UPDATE dataforge_rag_chunks SET archived_at = now() WHERE drive_file_id = $1 AND archived_at IS NULL`,
        [file.fileId],
      )
      for (const [index, brut] of chunks.entries()) {
        const texte = normalizeText(brut)
        // Idempotent sur fileId + modifiedTime : rejouer le même fichier ré-active ses chunks, n'en duplique aucun.
        await manager.query(
          `INSERT INTO dataforge_rag_chunks
             (data_version, chunk_id, account_id, entreprise, type_chunk, titre, texte, source, niveau_confiance,
              date_verification, priorite_indexation, longueur, drive_file_id, drive_modified_time, drive_path)
           VALUES ($1, $2, NULL, NULL, $3, $4, $5, $6, '[interne]', $7, 1, $8, $9, $10, $11)
           ON CONFLICT (chunk_id) DO UPDATE SET texte = EXCLUDED.texte, titre = EXCLUDED.titre, source = EXCLUDED.source,
             longueur = EXCLUDED.longueur, drive_path = EXCLUDED.drive_path, archived_at = NULL, embedding = NULL`,
          [
            DATA_VERSION,
            `drive:${file.fileId}:${file.modifiedTime}:${index}`,
            DRIVE_CHUNK_TYPE,
            file.name,
            texte,
            `drive:${file.path}`,
            file.modifiedTime,
            texte.length,
            file.fileId,
            file.modifiedTime,
            file.path,
          ],
        )
      }
    })
    return chunks.length
  }

  /** #3586 (W2) — le digest courant (ligne non archivée de la migration 1796432116109), ou `null`. */
  async getCurrentDigest(): Promise<KnowledgeDigest | null> {
    const rows = await this.dataSource.query(
      `SELECT content, fingerprint, created_at, size_chars FROM internal_knowledge_digests
       WHERE archived_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    )
    const r = (rows as Array<{ content: string; fingerprint: string; created_at: Date; size_chars: number }>)[0]
    return r
      ? { content: r.content, fingerprint: r.fingerprint, createdAt: r.created_at, sizeChars: r.size_chars }
      : null
  }

  /** Archive (jamais supprime) le digest courant puis insère le neuf, dans une transaction. */
  async saveDigest(digest: { content: string; fingerprint: string }): Promise<void> {
    await this.dataSource.transaction(async manager => {
      await manager.query(`UPDATE internal_knowledge_digests SET archived_at = now() WHERE archived_at IS NULL`)
      await manager.query(
        `INSERT INTO internal_knowledge_digests (content, fingerprint, size_chars) VALUES ($1, $2, $3)`,
        [digest.content, digest.fingerprint, digest.content.length],
      )
    })
  }

  async archiveChunks(fileId: string): Promise<void> {
    await this.dataSource.query(
      `UPDATE dataforge_rag_chunks SET archived_at = now() WHERE drive_file_id = $1 AND archived_at IS NULL`,
      [fileId],
    )
  }
}
