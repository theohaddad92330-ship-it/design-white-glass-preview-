import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { failure, success, type Result } from '@bellum/utils'
import type { CreateLibraryItem, LibraryItem, LibraryItemKind, UpdateLibraryItem } from '@bellum/contracts'
import { LibraryItemEntity } from '../../database/entities/library-item.entity'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import { DEFAULT_LIBRARY_ITEMS } from './default-library'

type LibraryFailureCode = 'not_found' | 'create_failed' | 'update_failed' | 'delete_failed'

export type LibraryFailure = {
  code: LibraryFailureCode
  message: string
  cause?: unknown
}

/** Entity → wire shape (ISO timestamps, no `user_id`/`workspace_id` leakage). */
function toWire(row: LibraryItemEntity): LibraryItem {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    description: row.description,
    category: row.category,
    body: row.body,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

@Injectable()
export class LibraryService {
  private readonly logger = new Logger(LibraryService.name)

  constructor(
    @InjectRepository(LibraryItemEntity)
    private readonly items: Repository<LibraryItemEntity>,
  ) {}

  /**
   * The workspace's library for one tab (`kind`). Seeds the built-in starter set
   * the first time a workspace is read (when it has no items at all), so every
   * team — existing or new — gets the same starter templates/playbooks, editable
   * thereafter. Seeding is idempotent (unique index + `ON CONFLICT DO NOTHING`).
   */
  async listForWorkspace(workspaceId: string, userId: string, kind: LibraryItemKind): Promise<LibraryItem[]> {
    await this.ensureSeeded(workspaceId, userId)
    const rows = await this.items.find({
      where: { ...workspaceScopeWhere(workspaceId), kind },
      order: { created_at: 'ASC' },
    })
    return rows.map(toWire)
  }

  private async ensureSeeded(workspaceId: string, userId: string): Promise<void> {
    try {
      const existing = await this.items.count({ where: workspaceScopeWhere(workspaceId) })
      if (existing > 0) return
      const seeds = DEFAULT_LIBRARY_ITEMS.map(item =>
        this.items.create({
          user_id: userId,
          workspace_id: workspaceId,
          kind: item.kind,
          title: item.title,
          description: item.description,
          category: item.category,
          body: item.body,
        }),
      )
      // The `(workspace_id, kind, title)` unique index + ON CONFLICT DO NOTHING
      // make this safe under a concurrent first read (two requests, two
      // replicas): the losing insert is a no-op, leaving exactly one seeded set.
      await this.items.createQueryBuilder().insert().values(seeds).orIgnore().execute()
    } catch (cause) {
      // Seeding is best-effort: a failure must not break the read. The tab just
      // shows whatever already exists (possibly empty).
      this.logger.error('Failed to seed default library items', { error: cause, workspaceId })
    }
  }

  async create(
    workspaceId: string,
    userId: string,
    dto: CreateLibraryItem,
  ): Promise<Result<LibraryItem, LibraryFailure>> {
    try {
      const saved = await this.items.save(
        this.items.create({
          user_id: userId,
          workspace_id: workspaceId,
          kind: dto.kind,
          title: dto.title,
          description: dto.description ?? null,
          category: dto.category ?? null,
          body: dto.body,
        }),
      )
      return success(toWire(saved))
    } catch (cause) {
      return failure({ code: 'create_failed', message: "Impossible de créer l'élément", cause })
    }
  }

  async update(id: string, workspaceId: string, dto: UpdateLibraryItem): Promise<Result<LibraryItem, LibraryFailure>> {
    try {
      const existing = await this.items.findOne({ where: { id, ...workspaceScopeWhere(workspaceId) } })
      if (!existing) return failure({ code: 'not_found', message: 'Élément introuvable' })
      if (dto.title !== undefined) existing.title = dto.title
      if (dto.description !== undefined) existing.description = dto.description
      if (dto.category !== undefined) existing.category = dto.category
      if (dto.body !== undefined) existing.body = dto.body
      const saved = await this.items.save(existing)
      return success(toWire(saved))
    } catch (cause) {
      return failure({ code: 'update_failed', message: "Impossible de mettre à jour l'élément", cause })
    }
  }

  async delete(id: string, workspaceId: string): Promise<Result<undefined, LibraryFailure>> {
    try {
      const existing = await this.items.findOne({
        where: { id, ...workspaceScopeWhere(workspaceId) },
        select: ['id'],
      })
      if (!existing) return failure({ code: 'not_found', message: 'Élément introuvable' })
      await this.items.delete({ id, ...workspaceScopeWhere(workspaceId) })
      return success()
    } catch (cause) {
      return failure({ code: 'delete_failed', message: "Impossible de supprimer l'élément", cause })
    }
  }
}
