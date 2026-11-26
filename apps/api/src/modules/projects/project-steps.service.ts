import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { CreateProjectStepInput, ProjectStep, UpdateProjectStepInput } from '@bellum/contracts'
import { ProjectStepEntity } from '../../database/entities/project-step.entity'
import { ProjectEntity } from '../../database/entities/project.entity'

function toProjectStep(row: ProjectStepEntity): ProjectStep {
  return {
    id: row.id,
    projectId: row.project_id,
    label: row.label,
    status: row.status,
    position: row.position,
    doneAt: row.done_at === null ? null : row.done_at.toISOString(),
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

/**
 * #2171.22 — Les « prochaines étapes » COCHABLES d'une opportunité. Voir
 * `project-step.ts` (`@bellum/contracts`) pour pourquoi cet objet EXISTE À
 * CÔTÉ de `ProjectRow.next_action` plutôt que de le remplacer. Même
 * mécanisme que `NeedStepsService`, porté par l'opportunité.
 */
@Injectable()
export class ProjectStepsService {
  constructor(
    @InjectRepository(ProjectStepEntity) private readonly steps: Repository<ProjectStepEntity>,
    @InjectRepository(ProjectEntity) private readonly projects: Repository<ProjectEntity>,
  ) {}

  private async assertProject(workspaceId: string, projectId: string): Promise<void> {
    const project = await this.projects.findOne({ where: { id: projectId, workspace_id: workspaceId } })
    if (!project) throw new NotFoundException('Opportunité introuvable')
  }

  async list(workspaceId: string, projectId: string): Promise<ProjectStep[]> {
    await this.assertProject(workspaceId, projectId)
    const rows = await this.steps.find({
      where: { workspace_id: workspaceId, project_id: projectId },
      order: { position: 'ASC' },
    })
    return rows.map(toProjectStep)
  }

  async create(workspaceId: string, projectId: string, input: CreateProjectStepInput): Promise<ProjectStep> {
    await this.assertProject(workspaceId, projectId)
    // La position est le rang d'arrivée, jamais recomptée : une étape ajoutée
    // se pose après les autres, elle ne réordonne pas celles qui existent.
    const last = await this.steps.findOne({
      where: { workspace_id: workspaceId, project_id: projectId },
      order: { position: 'DESC' },
    })
    const row = this.steps.create({
      workspace_id: workspaceId,
      project_id: projectId,
      label: input.label,
      status: 'todo',
      position: last ? last.position + 1 : 0,
      done_at: null,
    })
    return toProjectStep(await this.steps.save(row))
  }

  /**
   * Cocher, décocher, ou marquer « en attente ». `done_at` suit le statut dans
   * les DEUX sens — même raison que `NeedStepsService.updateStatus`.
   */
  async updateStatus(
    workspaceId: string,
    projectId: string,
    stepId: string,
    input: UpdateProjectStepInput,
  ): Promise<ProjectStep> {
    await this.assertProject(workspaceId, projectId)
    const row = await this.steps.findOne({ where: { id: stepId, workspace_id: workspaceId, project_id: projectId } })
    if (!row) throw new NotFoundException('Étape introuvable')

    row.status = input.status
    row.done_at = input.status === 'done' ? new Date() : null
    return toProjectStep(await this.steps.save(row))
  }
}
