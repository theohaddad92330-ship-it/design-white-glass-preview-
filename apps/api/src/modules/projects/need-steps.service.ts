import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { CreateNeedStepInput, NeedStep, UpdateNeedStepInput } from '@bellum/contracts'
import { NeedStepEntity } from '../../database/entities/need-step.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'

function toNeedStep(row: NeedStepEntity): NeedStep {
  return {
    id: row.id,
    needId: row.need_id,
    label: row.label,
    status: row.status,
    position: row.position,
    doneAt: row.done_at === null ? null : row.done_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

/**
 * Les « prochaines étapes » COCHABLES d'un besoin. Voir `need-step.ts`
 * (`@bellum/contracts`) pour pourquoi cet objet EXISTE À CÔTÉ de
 * `needNextAction` plutôt que de le remplacer.
 */
@Injectable()
export class NeedStepsService {
  constructor(
    @InjectRepository(NeedStepEntity) private readonly steps: Repository<NeedStepEntity>,
    @InjectRepository(ProjectNeedEntity) private readonly needs: Repository<ProjectNeedEntity>,
  ) {}

  private async assertNeed(workspaceId: string, needId: string): Promise<void> {
    const need = await this.needs.findOne({ where: { id: needId, workspace_id: workspaceId } })
    if (!need) throw new NotFoundException('Besoin introuvable')
  }

  async list(workspaceId: string, needId: string): Promise<NeedStep[]> {
    await this.assertNeed(workspaceId, needId)
    const rows = await this.steps.find({
      where: { workspace_id: workspaceId, need_id: needId },
      order: { position: 'ASC' },
    })
    return rows.map(toNeedStep)
  }

  async create(workspaceId: string, needId: string, input: CreateNeedStepInput): Promise<NeedStep> {
    await this.assertNeed(workspaceId, needId)
    // La position est le rang d'arrivée, jamais recomptée : une étape ajoutée
    // se pose après les autres, elle ne réordonne pas celles qui existent.
    const last = await this.steps.findOne({
      where: { workspace_id: workspaceId, need_id: needId },
      order: { position: 'DESC' },
    })
    const row = this.steps.create({
      workspace_id: workspaceId,
      need_id: needId,
      label: input.label,
      status: 'todo',
      position: last ? last.position + 1 : 0,
      done_at: null,
    })
    return toNeedStep(await this.steps.save(row))
  }

  /**
   * Cocher, décocher, ou marquer « en attente ».
   *
   * `done_at` suit le statut dans les DEUX sens : passer à `done` le pose à
   * maintenant, en repartir (décocher une case cochée par erreur) l'efface.
   * Une date qui resterait après un décochage mentirait — l'étape n'est plus
   * terminée, mais l'écran continuerait de dire quand elle l'a été.
   */
  async updateStatus(
    workspaceId: string,
    needId: string,
    stepId: string,
    input: UpdateNeedStepInput,
  ): Promise<NeedStep> {
    await this.assertNeed(workspaceId, needId)
    const row = await this.steps.findOne({ where: { id: stepId, workspace_id: workspaceId, need_id: needId } })
    if (!row) throw new NotFoundException('Étape introuvable')

    row.status = input.status
    row.done_at = input.status === 'done' ? new Date() : null
    return toNeedStep(await this.steps.save(row))
  }
}
