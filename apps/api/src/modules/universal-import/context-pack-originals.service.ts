import { Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import {
  CONTEXT_PACK_ORIGINAL_MAX_BYTES,
  CONTEXT_PACK_ORIGINAL_URL_TTL_SECONDS,
  contextPackOriginalMimeType,
  contextPackOriginalStoragePath,
  type ContextPackOriginalStatus,
  type ContextPackOriginalUrl,
  type ContextPackRecordRequest,
} from '@bellum/contracts'
import { In, Repository } from 'typeorm'
import { ContextPackImportEntity } from '../../database/entities/context-pack-import.entity'
import { StorageClient } from '../storage/storage.client'

type OriginalColumns = Pick<
  ContextPackImportEntity,
  'original_status' | 'original_storage_path' | 'original_mime_type' | 'original_size_bytes'
>

const NOT_KEPT = (status: ContextPackOriginalStatus | null): OriginalColumns => ({
  original_status: status,
  original_storage_path: null,
  original_mime_type: null,
  original_size_bytes: null,
})

/**
 * #4573 — l'ORIGINAL d'un document de contexte : conservé au dépôt, relu par URL signée, effacé avec sa donnée.
 *
 * Le chemin des CV (#4034, Louis 12/10/2026), suivi tel quel : le MÊME seau privé (`StorageClient`), la MÊME durée
 * d'URL (`CONTEXT_PACK_ORIGINAL_URL_TTL_SECONDS` = celle des CV), le MÊME nommage d'objet
 * (`<workspace_id>/context-pack/<import_id>/<nom>`, nom assaini par `safeStorageName`), le MÊME droit : il se tranche
 * ICI, sur la ligne parente lue AVEC son espace — `StorageClient` n'en vérifie aucun.
 *
 * Module à part (`context-pack-originals.module.ts`) : l'effacement d'une personne (`contacts`) l'atteint par un port,
 * sans cycle de modules ni import de service voisin (GA-07).
 *
 * ⚠️ Le CORPS n'est jamais lu ici — ni par nous, ni par un modèle. Le journal nomme l'IMPORT, jamais le fichier.
 */
@Injectable()
export class ContextPackOriginalsService {
  private readonly logger = new Logger(ContextPackOriginalsService.name)

  constructor(
    @InjectRepository(ContextPackImportEntity) private readonly rows: Repository<ContextPackImportEntity>,
    /** Optionnel, comme pour les CV : absent, zéro appel — la ligne dit « non conservé ». */
    @Optional() private readonly storage?: StorageClient,
  ) {}

  /**
   * Range l'original AU DÉPÔT et rend les colonnes à écrire sur la ligne. Un échec de stockage n'est pas un échec
   * d'import : l'importeur a déjà pris le fichier, la ligne dira seulement que l'original n'est pas gardé.
   */
  async keep(
    workspaceId: string,
    importId: string,
    input: Pick<ContextPackRecordRequest, 'fileName' | 'status' | 'fileB64' | 'originalTooBig'>,
  ): Promise<OriginalColumns> {
    // Un import échoué n'a rien créé : son original n'a aucune donnée dont suivre le sort.
    if (input.status === 'failed') return NOT_KEPT('failed_import')
    if (input.originalTooBig) return NOT_KEPT('too_big')
    if (!input.fileB64) return NOT_KEPT(null)
    const bytes = Buffer.from(input.fileB64, 'base64')
    if (bytes.byteLength > CONTEXT_PACK_ORIGINAL_MAX_BYTES) return NOT_KEPT('too_big')
    if (!this.storage) return NOT_KEPT('unavailable')
    const path = contextPackOriginalStoragePath(workspaceId, importId, input.fileName)
    const mimeType = contextPackOriginalMimeType(input.fileName)
    try {
      await this.storage.put(path, bytes, mimeType)
    } catch {
      this.logger.warn(`#4573 — original non conservé pour l'import ${importId} (stockage indisponible)`)
      return NOT_KEPT('unavailable')
    }
    return {
      original_status: 'kept',
      original_storage_path: path,
      original_mime_type: mimeType,
      original_size_bytes: bytes.byteLength,
    }
  }

  /** La ligne n'a pas pu s'écrire : un objet que plus rien ne désigne repart aussitôt. */
  async discard(path: string | null): Promise<void> {
    if (path && this.storage) await this.storage.remove([path])
  }

  /**
   * L'URL signée de l'original d'UN import de l'espace. Un import d'un autre espace et un id inexistant rendent le
   * MÊME 404 : la réponse ne confirme pas qu'un document existe ailleurs.
   */
  async signedUrl(workspaceId: string, importId: string): Promise<ContextPackOriginalUrl> {
    const row = await this.rows.findOne({ where: { id: importId, workspace_id: workspaceId } })
    if (!row) throw new NotFoundException('Import introuvable')
    if (!row.original_storage_path) throw new NotFoundException('Original non conservé pour cet import')
    if (!this.storage) throw new ServiceUnavailableException('Le stockage des fichiers n’est pas branché.')
    const url = await this.storage.signedUrl(row.original_storage_path, CONTEXT_PACK_ORIGINAL_URL_TTL_SECONDS)
    return {
      url,
      expiresAt: new Date(Date.now() + CONTEXT_PACK_ORIGINAL_URL_TTL_SECONDS * 1000).toISOString(),
      mimeType: row.original_mime_type ?? null,
      fileName: row.file_name,
    }
  }

  /**
   * #4573 / c67 (#2297) — l'effacement d'une personne à sa demande emporte les originaux de l'espace. Le corps d'un
   * original n'est jamais lu (interdit) : on ne peut donc pas prouver qu'il ne la cite pas, et un original n'est
   * qu'une COPIE d'un fichier déjà importé — l'effacer ne retire rien à la donnée créée. La ligne reste (« effacé »),
   * l'OBJET part. Un effacement refusé par le seau garde le chemin : le prochain effacement le retrouvera.
   */
  async eraseWorkspaceOriginals(workspaceId: string): Promise<{ erased: number; deferred: number }> {
    const kept = await this.rows.find({ where: { workspace_id: workspaceId, original_status: 'kept' } })
    const withPath = kept.filter(row => !!row.original_storage_path)
    if (withPath.length === 0 || !this.storage) return { erased: 0, deferred: withPath.length }
    const removed = await this.storage.remove(withPath.map(row => row.original_storage_path as string))
    if (!removed) {
      this.logger.error(`#4573 — ${withPath.length} original(aux) de pack non effacé(s) sur l'espace ${workspaceId}`)
      return { erased: 0, deferred: withPath.length }
    }
    await this.rows.update(
      { id: In(withPath.map(row => row.id)), workspace_id: workspaceId },
      { ...NOT_KEPT('erased') },
    )
    return { erased: withPath.length, deferred: 0 }
  }
}
