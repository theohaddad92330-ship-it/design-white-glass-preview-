import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { CreateProjectDocumentInput, ProjectDocument, ProjectDocumentStatus } from '@bellum/contracts'
import { ProjectDocumentEntity } from '../../database/entities/project-document.entity'
import { ProjectEntity } from '../../database/entities/project.entity'

function toProjectDocument(row: ProjectDocumentEntity): ProjectDocument {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    name: row.name,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

/**
 * #2171.24 (épopée #2951) — Les DOCUMENTS d'une opportunité — devis, NDA,
 * contrat cadre — et leur statut. Voir le docblock de `project-document.ts`
 * (`@bellum/contracts`) : PAS de fichier joint dans cette tranche, contrairement
 * à `NeedDocumentsService` — le suivi (kind/name/status) est la plus petite
 * tranche prouvable, l'intégration au stockage reste HORS de ce lot.
 *
 * ⚠️ Toute lecture ET toute écriture sont bornées par `workspace_id` ET par
 * `project_id`, même discipline que `NeedDocumentsService` : sans le second,
 * un identifiant de document valide dans l'espace laisserait changer le
 * statut d'une pièce qui pend d'une AUTRE opportunité.
 */
@Injectable()
export class ProjectDocumentsService {
  constructor(
    @InjectRepository(ProjectDocumentEntity) private readonly documents: Repository<ProjectDocumentEntity>,
    @InjectRepository(ProjectEntity) private readonly projects: Repository<ProjectEntity>,
  ) {}

  async list(workspaceId: string, projectId: string): Promise<ProjectDocument[]> {
    await this.assertProject(workspaceId, projectId)
    const rows = await this.documents.find({
      where: { workspace_id: workspaceId, project_id: projectId },
      order: { created_at: 'ASC' },
    })
    return rows.map(toProjectDocument)
  }

  /**
   * Suit un document sur une opportunité. `draft` est le seul statut de
   * départ possible : personne n'a encore affirmé qu'une pièce est partie.
   */
  async create(workspaceId: string, projectId: string, input: CreateProjectDocumentInput): Promise<ProjectDocument> {
    await this.assertProject(workspaceId, projectId)
    const saved = await this.documents.save(
      this.documents.create({
        workspace_id: workspaceId,
        project_id: projectId,
        kind: input.kind,
        name: input.name,
        status: 'draft',
      }),
    )
    return toProjectDocument(saved)
  }

  /**
   * Fait avancer un document : envoyé, en attente, signé, refusé. Aucune
   * transition interdite — même raison que `NeedDocumentsService` : un
   * automate bloquerait des corrections légitimes.
   */
  async updateStatus(
    workspaceId: string,
    projectId: string,
    documentId: string,
    status: ProjectDocumentStatus,
  ): Promise<ProjectDocument> {
    const row = await this.documents.findOne({
      where: { id: documentId, workspace_id: workspaceId, project_id: projectId },
    })
    if (!row) throw new NotFoundException('Document introuvable sur cette opportunité.')

    row.status = status
    return toProjectDocument(await this.documents.save(row))
  }

  private async assertProject(workspaceId: string, projectId: string): Promise<void> {
    const project = await this.projects.findOne({ where: { id: projectId, workspace_id: workspaceId } })
    if (!project) throw new NotFoundException('Opportunité introuvable')
  }
}
