import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { hasPermission, type WorkspaceRole } from '@bellum/contracts'
import { MissionEntity } from '../../database/entities/mission.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ProjectEntity } from '../../database/entities/project.entity'

export type PrivacyKind = 'project' | 'need' | 'mission'

export interface PrivacyActor {
  userId: string
  workspaceId: string
  role: WorkspaceRole
}

/**
 * #4158.34 — le geste qui MARQUE un objet privé (la lecture, elle, filtre déjà :
 * `contact-associations.ts`). Défaut inchangé : partagé. Seul le porteur
 * (`owner_id`) ou qui gère l'équipe (`team:manage`) bascule le drapeau — sinon
 * un collègue pourrait cacher l'objet d'un autre.
 */
@Injectable()
export class ObjectPrivacyService {
  constructor(
    @InjectRepository(ProjectEntity) private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(ProjectNeedEntity) private readonly needs: Repository<ProjectNeedEntity>,
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
  ) {}

  async setPrivate(
    kind: PrivacyKind,
    id: string,
    isPrivate: boolean,
    actor: PrivacyActor,
  ): Promise<{ id: string; is_private: boolean }> {
    const repo = this.repoFor(kind)
    const where = { id, workspace_id: actor.workspaceId }
    // L'espace actif d'abord : un objet d'un autre espace est un 404, jamais un 403
    // (on ne confirme pas qu'il existe).
    const row = await repo.findOne({ where })
    if (!row) throw new NotFoundException('Objet introuvable')
    const isOwner = row.owner_id !== null && row.owner_id === actor.userId
    if (!isOwner && !hasPermission(actor.role, 'team:manage')) {
      throw new ForbiddenException('Seul le porteur ou la gestion de l’équipe change la confidentialité')
    }
    await repo.update(where, { is_private: isPrivate })
    return { id, is_private: isPrivate }
  }

  private repoFor(kind: PrivacyKind): Repository<ProjectEntity | ProjectNeedEntity | MissionEntity> {
    if (kind === 'project') return this.projects as Repository<ProjectEntity | ProjectNeedEntity | MissionEntity>
    if (kind === 'need') return this.needs as Repository<ProjectEntity | ProjectNeedEntity | MissionEntity>
    return this.missions as Repository<ProjectEntity | ProjectNeedEntity | MissionEntity>
  }
}
