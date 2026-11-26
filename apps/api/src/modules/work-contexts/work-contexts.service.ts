import { randomUUID } from 'node:crypto'
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { ActivateWorkContextResponse, CreateWorkContext, WorkContext } from '@bellum/contracts'
import { WorkContextEntity } from '../../database/entities/work-context.entity'
import { WorkContextActivationEntity } from '../../database/entities/work-context-activation.entity'
import { BusinessUnitService } from '../business-unit/business-unit.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'

/**
 * #2455 — Contextes de travail enregistrés (LAU-FINAL-168).
 *
 * ⚠️ #2455.8 (NO-GO explicite de l'issue) : créer un contexte n'écrit JAMAIS
 * dans `profiles`/`esn_profiles` — ce service ne touche QUE `work_contexts` /
 * `work_context_activations`. Un contexte est une variante à côté du profil,
 * jamais une mutation du profil (garde : `work-contexts.service.spec.ts`
 * « n'écrit jamais dans profiles/esn_profiles »).
 *
 * #2455.6 : la mise à jour du profil principal n'est JAMAIS automatique — ce
 * service ne l'écrit nulle part ; seule une proposition avec diff, côté écran,
 * pourra un jour le faire, sur un geste explicite.
 */
@Injectable()
export class WorkContextsService {
  constructor(
    @InjectRepository(WorkContextEntity)
    private readonly repo: Repository<WorkContextEntity>,
    @InjectRepository(WorkContextActivationEntity)
    private readonly activations: Repository<WorkContextActivationEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly businessUnits: BusinessUnitService,
  ) {}

  /**
   * #2455.7 — multi-BU : un membre voit SES contextes (toute visibilité), plus
   * ceux `visibility=bu` des BU dont il est membre, plus ceux `visibility=group`
   * de tout l'espace. Les `archive` sont exclus par défaut (pas proposés).
   */
  async list(userId: string, opts: { includeArchived?: boolean } = {}): Promise<WorkContext[]> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const buIds = await this.businessUnits.perimetersOf(workspaceId, userId)

    const rows = await this.repo
      .createQueryBuilder('wc')
      .where('wc.workspace_id = :workspaceId', { workspaceId })
      .andWhere(opts.includeArchived ? '1=1' : "wc.status <> 'archive'")
      // #3477 — `business_unit_id` est une colonne UUID : lier `['']` quand la
      // personne n'a aucun périmètre faisait échouer la requête (500 à chaque
      // ouverture de /chat). Sans périmètre, la clause BU n'existe simplement pas.
      .andWhere(
        buIds.length > 0
          ? '(wc.owner_user_id = :userId OR wc.visibility = :group OR (wc.visibility = :bu AND wc.business_unit_id IN (:...buIds)))'
          : '(wc.owner_user_id = :userId OR wc.visibility = :group)',
        buIds.length > 0 ? { userId, group: 'group', bu: 'bu', buIds } : { userId, group: 'group' },
      )
      .orderBy('wc.updated_at', 'DESC')
      .getMany()

    return rows.map(row => toWire(row, workspaceId))
  }

  async get(userId: string, id: string): Promise<WorkContext> {
    const context = await this.findVisible(userId, id)
    return toWire(context.entity, context.workspaceId)
  }

  /** #2455.1/.2/.3 — créer une variante SANS toucher au profil principal. */
  async create(userId: string, body: CreateWorkContext): Promise<WorkContext> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    await this.workspaceContext.assertMember(userId, workspaceId)

    let businessUnitId: string | null = null
    if (body.visibility === 'bu') {
      const buIds = await this.businessUnits.perimetersOf(workspaceId, userId)
      businessUnitId = buIds[0] ?? null
    }

    const saved = await this.repo.save(
      this.repo.create({
        workspace_id: workspaceId,
        owner_user_id: userId,
        name: body.name,
        visibility: body.visibility,
        business_unit_id: businessUnitId,
        status: body.status,
        objective: body.objective ?? null,
        offer: body.offer ?? null,
        expertise: body.expertise ?? null,
        technologies: body.technologies ?? [],
        sectors: body.sectors ?? [],
        territories: body.territories ?? [],
        company_types: body.company_types ?? [],
        sizes: body.sizes ?? [],
        delivery_model: body.delivery_model ?? null,
        exclusions: body.exclusions ?? [],
        reference_list: body.reference_list ?? [],
        capacity: body.capacity ?? null,
        data_layers: body.data_layers ?? [],
      }),
    )

    return toWire(saved, workspaceId)
  }

  /**
   * #2455.5 — activer un contexte OUVRE une conversation neuve (générée ici,
   * jamais réutilisée) : le fil d'origine n'est jamais touché. On retient
   * seulement quel contexte est actif pour cette conversation.
   */
  async activate(userId: string, id: string): Promise<ActivateWorkContextResponse> {
    const { entity, workspaceId } = await this.findVisible(userId, id)
    const conversationId = randomUUID()

    await this.activations.save(
      this.activations.create({
        work_context_id: entity.id,
        workspace_id: workspaceId,
        user_id: userId,
        conversation_id: conversationId,
      }),
    )

    return { work_context: toWire(entity, workspaceId), conversation_id: conversationId }
  }

  /** #2455.3 — un contexte archivé n'est plus proposé par défaut, jamais supprimé. */
  async archive(userId: string, id: string): Promise<WorkContext> {
    const { entity } = await this.findVisible(userId, id)
    if (entity.owner_user_id !== userId) {
      throw new ForbiddenException('Seul le propriétaire archive son contexte')
    }
    entity.status = 'archive'
    const saved = await this.repo.save(entity)
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    return toWire(saved, workspaceId)
  }

  /**
   * #2455.6 — le SIGNAL D'USAGE d'un contexte, pour qu'un appelant (le
   * contrôleur, seul à lire le profil principal — un autre module) décide s'il
   * y a une PROPOSITION à faire. Ce service ne lit et n'écrit JAMAIS
   * `profiles`/`esn_profiles` (#2455.8) : il rend seulement les secteurs du
   * contexte et le nombre de fois que CET appelant l'a lui-même activé.
   *
   * `null` pour tout ce qui n'est pas un contexte PERSONNEL possédé par
   * l'appelant : proposer une mise à jour du profil sur l'usage d'un contexte
   * de BU ou de groupe mélangerait l'activité de plusieurs personnes.
   */
  async usageSignal(userId: string, id: string): Promise<{ sectors: string[]; activationCount: number } | null> {
    const { entity } = await this.findVisible(userId, id)
    if (entity.owner_user_id !== userId || entity.visibility !== 'personal') return null
    const activationCount = await this.activations.count({ where: { work_context_id: entity.id, user_id: userId } })
    return { sectors: entity.sectors ?? [], activationCount }
  }

  private async findVisible(userId: string, id: string): Promise<{ entity: WorkContextEntity; workspaceId: string }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const entity = await this.repo.findOne({ where: { id } })
    if (!entity || entity.workspace_id !== workspaceId) {
      throw new NotFoundException('Contexte de travail introuvable')
    }
    if (entity.owner_user_id !== userId && entity.visibility === 'personal') {
      throw new NotFoundException('Contexte de travail introuvable')
    }
    if (entity.visibility === 'bu' && entity.owner_user_id !== userId) {
      const buIds = await this.businessUnits.perimetersOf(workspaceId, userId)
      if (!entity.business_unit_id || !buIds.includes(entity.business_unit_id)) {
        throw new NotFoundException('Contexte de travail introuvable')
      }
    }
    return { entity, workspaceId }
  }
}

function toWire(entity: WorkContextEntity, workspaceId: string): WorkContext {
  return {
    context_id: entity.id,
    name: entity.name,
    owner: entity.owner_user_id,
    workspace: workspaceId,
    visibility: entity.visibility,
    business_unit_id: entity.business_unit_id,
    objective: entity.objective,
    offer: entity.offer,
    expertise: entity.expertise,
    technologies: entity.technologies ?? [],
    sectors: entity.sectors ?? [],
    territories: entity.territories ?? [],
    company_types: entity.company_types ?? [],
    sizes: entity.sizes ?? [],
    delivery_model: entity.delivery_model,
    exclusions: entity.exclusions ?? [],
    reference_list: entity.reference_list ?? [],
    capacity: entity.capacity,
    data_layers: entity.data_layers ?? [],
    created_at: new Date(entity.created_at).toISOString(),
    updated_at: new Date(entity.updated_at).toISOString(),
    version: entity.version,
    status: entity.status,
  }
}
