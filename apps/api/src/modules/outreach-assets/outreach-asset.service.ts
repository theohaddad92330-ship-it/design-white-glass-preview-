import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { failure, success, type Result } from '@bellum/utils'
import { EMAIL_ATTACHMENT_MAX_TOTAL_BYTES } from '@bellum/contracts'
import type {
  CreateOutreachAsset,
  OutreachAsset,
  OutreachAssetFile,
  StorageUploadInput,
  UpdateOutreachAsset,
} from '@bellum/contracts'
import { OutreachAssetEntity } from '../../database/entities/outreach-asset.entity'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { OUTREACH_ASSET_STORAGE, type OutreachAssetStorage } from './module-tokens'
import { DEFAULT_OUTREACH_ASSETS } from './default-outreach-assets'

type OutreachAssetFailureCode =
  | 'not_found'
  | 'create_failed'
  | 'update_failed'
  | 'delete_failed'
  | 'no_file'
  | 'file_too_large'

export type OutreachAssetFailure = {
  code: OutreachAssetFailureCode
  message: string
  cause?: unknown
}

/** Entity → wire shape (ISO timestamps, no `user_id`/`workspace_id`/`storage_object_id` leakage). */
function toWire(row: OutreachAssetEntity, file: OutreachAssetFile | null = null): OutreachAsset {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    usageRights: row.usage_rights,
    file,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

/**
 * Le catalogue de la bibliothèque d'assets outreach (#2838) — métadonnées et
 * droits d'usage, workspace-scopé, team-shared. Même geste que `LibraryService` :
 * un workspace neuf est lazy-seedé d'un catalogue de démarrage à sa première
 * lecture, ensuite chaque asset est une ligne normale. Aucun gate d'envoi ici :
 * `usageRights` NOMME la règle (#2372.6), il ne l'applique pas — voir le
 * docblock de `packages/contracts/src/schemas/outreach-asset.ts`.
 */
@Injectable()
export class OutreachAssetService {
  private readonly logger = new Logger(OutreachAssetService.name)

  constructor(
    @InjectRepository(OutreachAssetEntity)
    private readonly assets: Repository<OutreachAssetEntity>,
    @Inject(OUTREACH_ASSET_STORAGE) private readonly storage: OutreachAssetStorage,
  ) {}

  async listForWorkspace(workspaceId: string, userId: string): Promise<OutreachAsset[]> {
    await this.ensureSeeded(workspaceId, userId)
    const rows = await this.assets.find({
      where: workspaceScopeWhere(workspaceId),
      order: { created_at: 'ASC' },
    })
    const files = await this.filesOf(workspaceId, rows)
    return rows.map(row => toWire(row, (row.storage_object_id && files.get(row.storage_object_id)) || null))
  }

  /**
   * #3699.6 — les fichiers RÉELLEMENT rangés des assets, en UNE requête bornée
   * à l'espace. Un identifiant qui ne revient pas = fichier absent : l'asset
   * s'affiche sans fichier, jamais avec un fichier deviné.
   */
  private async filesOf(
    workspaceId: string,
    rows: readonly OutreachAssetEntity[],
  ): Promise<Map<string, OutreachAssetFile>> {
    const ids = rows.map(row => row.storage_object_id).filter((id): id is string => Boolean(id))
    if (ids.length === 0) return new Map()
    const records = await this.storage.byIds(workspaceId, ids)
    return new Map(
      [...records].map(([id, record]) => [
        id,
        {
          fileName: record.fileName,
          contentType: record.contentType,
          byteSize: record.byteSize,
          sha256: record.contentSha256 ?? null,
        },
      ]),
    )
  }

  /**
   * #3699.6 — RATTACHE le fichier réel d'un asset (la bibliothèque de documents
   * attachables). Le stockage partagé décide du type (extension ET signature,
   * liste {@link EMAIL_ATTACHMENT_TYPES} du domaine), mesure la taille, pose
   * l'empreinte et tient le quota de l'espace. Un fichier remplacé PART : un
   * asset porte un fichier, jamais un historique d'octets que rien ne lit.
   *
   * Les refus du stockage (taille, type, signature, quota) remontent TELS
   * QUELS — ils portent déjà leur phrase.
   */
  async attachFile(
    id: string,
    workspaceId: string,
    userId: string,
    upload: StorageUploadInput,
    today: string,
  ): Promise<Result<OutreachAsset, OutreachAssetFailure>> {
    const existing = await this.assets.findOne({ where: { id, ...workspaceScopeWhere(workspaceId) } })
    if (!existing) return failure({ code: 'not_found', message: 'Asset introuvable' })
    // Un document plus lourd que la borne d'un e-mail ne pourrait JAMAIS partir :
    // refusé au dépôt, avant tout octet rangé, plutôt qu'au moment d'envoyer.
    if (Buffer.byteLength(upload.fileB64, 'base64') > EMAIL_ATTACHMENT_MAX_TOTAL_BYTES) {
      const megabytes = (EMAIL_ATTACHMENT_MAX_TOTAL_BYTES / (1024 * 1024)).toLocaleString('fr-FR')
      return failure({
        code: 'file_too_large',
        message: `Ce document dépasse ${megabytes} Mo : il ne pourrait pas partir en pièce jointe. Dépose une version allégée.`,
      })
    }
    const stored = await this.storage.put({
      workspaceId,
      domain: 'outreach_asset_file',
      fileName: upload.fileName,
      contentType: upload.contentType,
      fileB64: upload.fileB64,
      uploadedBy: userId,
      today,
    })
    const previous = existing.storage_object_id
    existing.storage_object_id = stored.id
    try {
      await this.assets.save(existing)
    } catch (cause) {
      // La ligne n'a pas pris : les octets neufs repartent, l'ancien fichier reste.
      await this.storage.remove(workspaceId, stored.id).catch(() => undefined)
      return failure({ code: 'update_failed', message: "Impossible de rattacher le fichier à l'asset", cause })
    }
    if (previous) await this.removeObjectQuietly(workspaceId, previous)
    return success(
      toWire(existing, {
        fileName: stored.fileName,
        contentType: stored.contentType,
        byteSize: stored.byteSize,
        sha256: stored.contentSha256 ?? null,
      }),
    )
  }

  /** #3699.6 — RETIRE le fichier d'un asset : l'asset reste, annoncé sans fichier. */
  async detachFile(id: string, workspaceId: string): Promise<Result<OutreachAsset, OutreachAssetFailure>> {
    const existing = await this.assets.findOne({ where: { id, ...workspaceScopeWhere(workspaceId) } })
    if (!existing) return failure({ code: 'not_found', message: 'Asset introuvable' })
    const previous = existing.storage_object_id
    if (!previous) return failure({ code: 'no_file', message: "Cet asset n'a pas de fichier à retirer." })
    existing.storage_object_id = null
    await this.assets.save(existing)
    await this.removeObjectQuietly(workspaceId, previous)
    return success(toWire(existing, null))
  }

  /**
   * Un objet qui ne part pas (magasin indisponible, déjà effacé) n'annule pas
   * le geste : l'asset ne le désigne plus. Journalisé SANS chemin ni nom.
   */
  private async removeObjectQuietly(workspaceId: string, objectId: string): Promise<void> {
    try {
      await this.storage.remove(workspaceId, objectId)
    } catch (cause) {
      this.logger.warn('Outreach asset file removal failed', { error: cause, workspaceId })
    }
  }

  private async ensureSeeded(workspaceId: string, userId: string): Promise<void> {
    try {
      const existing = await this.assets.count({ where: workspaceScopeWhere(workspaceId) })
      if (existing > 0) return
      const seeds = DEFAULT_OUTREACH_ASSETS.map(asset =>
        this.assets.create({
          user_id: userId,
          workspace_id: workspaceId,
          title: asset.title,
          description: asset.description,
          category: asset.category,
          usage_rights: asset.usageRights,
        }),
      )
      await this.assets.save(seeds)
    } catch (cause) {
      // Best-effort, comme `LibraryService.ensureSeeded` : un échec du semis ne
      // doit pas casser la lecture. L'onglet montre ce qui existe déjà.
      this.logger.error('Failed to seed default outreach assets', { error: cause, workspaceId })
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateOutreachAsset,
  ): Promise<Result<OutreachAsset, OutreachAssetFailure>> {
    try {
      const saved = await this.assets.save(
        this.assets.create({
          user_id: userId,
          workspace_id: workspaceId,
          title: dto.title,
          description: dto.description ?? null,
          category: dto.category,
          usage_rights: dto.usageRights,
        }),
      )
      return success(toWire(saved, null))
    } catch (cause) {
      return failure({ code: 'create_failed', message: "Impossible de créer l'asset", cause })
    }
  }

  async update(
    id: string,
    workspaceId: string,
    dto: UpdateOutreachAsset,
  ): Promise<Result<OutreachAsset, OutreachAssetFailure>> {
    try {
      const existing = await this.assets.findOne({ where: { id, ...workspaceScopeWhere(workspaceId) } })
      if (!existing) return failure({ code: 'not_found', message: 'Asset introuvable' })
      if (dto.title !== undefined) existing.title = dto.title
      if (dto.description !== undefined) existing.description = dto.description
      if (dto.category !== undefined) existing.category = dto.category
      if (dto.usageRights !== undefined) existing.usage_rights = dto.usageRights
      const saved = await this.assets.save(existing)
      const files = await this.filesOf(workspaceId, [saved])
      return success(toWire(saved, (saved.storage_object_id && files.get(saved.storage_object_id)) || null))
    } catch (cause) {
      return failure({ code: 'update_failed', message: "Impossible de mettre à jour l'asset", cause })
    }
  }

  async delete(id: string, workspaceId: string): Promise<Result<undefined, OutreachAssetFailure>> {
    try {
      const existing = await this.assets.findOne({
        where: { id, ...workspaceScopeWhere(workspaceId) },
        select: ['id', 'storage_object_id'],
      })
      if (!existing) return failure({ code: 'not_found', message: 'Asset introuvable' })
      await this.assets.delete({ id, ...workspaceScopeWhere(workspaceId) })
      // #3699.6 — le fichier vit autant que l'asset (domaine lié à son document).
      if (existing.storage_object_id) await this.removeObjectQuietly(workspaceId, existing.storage_object_id)
      return success()
    } catch (cause) {
      return failure({ code: 'delete_failed', message: "Impossible de supprimer l'asset", cause })
    }
  }
}
