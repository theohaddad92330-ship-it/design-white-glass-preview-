import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Repository } from 'typeorm'
import { UserAngleEntity } from '../../database/entities/user-angle.entity'

type UserAngleCtx = { userId: string; workspaceId: string | null }

export type UserAngleView = {
  id: string
  title: string
  content: string
  archived: boolean
  createdAt: string
  updatedAt: string
}

/**
 * #4739 — « Mes angles » : les angles qu'un commercial écrit lui-même.
 * Personnels à leur créateur (le partage à l'espace est une question ouverte, pas ce lot). Une ligne
 * d'un autre utilisateur est INTROUVABLE, jamais « interdite » : on ne confirme pas son existence.
 * Rien ne réécrit un angle humain : aucun chemin de recalcul ne touche cette table.
 */
@Injectable()
export class UserAnglesService {
  constructor(@InjectRepository(UserAngleEntity) private readonly angles: Repository<UserAngleEntity>) {}

  async list(userId: string): Promise<UserAngleView[]> {
    // `archived_at: null` n'est pas un filtre TypeORM valide (il faudrait `IsNull()`) : on filtre ici, sans ambiguïté.
    const rows = await this.angles.find({ where: { user_id: userId }, order: { updated_at: 'DESC' } })
    return rows.filter(row => row.archived_at == null).map(toView)
  }

  async create(ctx: UserAngleCtx, input: { title: string; content: string }): Promise<UserAngleView> {
    const { title, content } = clean(input.title, input.content)
    const row = this.angles.create({
      user_id: ctx.userId,
      workspace_id: ctx.workspaceId,
      title,
      content,
      source: 'human',
      archived_at: null,
    })
    return toView(await this.angles.save(row))
  }

  async update(userId: string, id: string, patch: { title?: string; content?: string }): Promise<UserAngleView> {
    const row = await this.own(userId, id)
    const next = clean(patch.title ?? row.title, patch.content ?? row.content)
    return toView(await this.angles.save({ ...row, ...next, updated_at: new Date() }))
  }

  /** « Retirer » = archiver. La ligne reste. */
  async archive(userId: string, id: string): Promise<void> {
    const row = await this.own(userId, id)
    await this.angles.save({ ...row, archived_at: new Date(), updated_at: new Date() })
  }

  private async own(userId: string, id: string): Promise<UserAngleEntity> {
    const row = await this.angles.findOne({ where: { id, user_id: userId } })
    if (!row) throw new NotFoundException('Angle not found')
    return row
  }
}

function clean(title: string, content: string): { title: string; content: string } {
  const t = title.trim()
  const c = content.trim()
  if (!t || !c) throw new BadRequestException('user_angle_title_and_content_required')
  return { title: t, content: c }
}

function toView(row: UserAngleEntity): UserAngleView {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    archived: row.archived_at != null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}
