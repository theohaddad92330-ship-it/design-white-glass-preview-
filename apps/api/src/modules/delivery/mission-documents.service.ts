import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { CreateMissionDocumentInput, MissionDocument, MissionDocumentStatus } from '@bellum/contracts'
import { MissionDocumentEntity } from '../../database/entities/mission-document.entity'
import { MissionEntity } from '../../database/entities/mission.entity'

function toMissionDocument(row: MissionDocumentEntity): MissionDocument {
  return {
    id: row.id,
    missionId: row.mission_id,
    kind: row.kind,
    name: row.name,
    status: row.status,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

/**
 * #2193.51 (épopée #2953) — Les DOCUMENTS d'une mission — contrat signé,
 * avenant, NDA — et leur statut. Voir le docblock de `mission-document.ts`
 * (`@bellum/contracts`) : PAS de fichier joint dans cette tranche, même choix
 * que `ProjectDocumentsService` (#2171.24).
 *
 * ⚠️ Toute lecture ET toute écriture sont bornées par `workspace_id` ET par
 * `mission_id`, même discipline que `ProjectDocumentsService` : sans le
 * second, un identifiant de document valide dans l'espace laisserait
 * changer le statut d'une pièce qui pend d'une AUTRE mission.
 */
@Injectable()
export class MissionDocumentsService {
  constructor(
    @InjectRepository(MissionDocumentEntity) private readonly documents: Repository<MissionDocumentEntity>,
    @InjectRepository(MissionEntity) private readonly missions: Repository<MissionEntity>,
  ) {}

  async list(workspaceId: string, missionId: string): Promise<MissionDocument[]> {
    await this.assertMission(workspaceId, missionId)
    const rows = await this.documents.find({
      where: { workspace_id: workspaceId, mission_id: missionId },
      order: { created_at: 'ASC' },
    })
    return rows.map(toMissionDocument)
  }

  /**
   * Suit un document sur une mission. `draft` est le seul statut de départ
   * possible : personne n'a encore affirmé qu'une pièce est partie.
   */
  async create(workspaceId: string, missionId: string, input: CreateMissionDocumentInput): Promise<MissionDocument> {
    await this.assertMission(workspaceId, missionId)
    const saved = await this.documents.save(
      this.documents.create({
        workspace_id: workspaceId,
        mission_id: missionId,
        kind: input.kind,
        name: input.name,
        status: 'draft',
      }),
    )
    return toMissionDocument(saved)
  }

  /**
   * Fait avancer un document : envoyé, en attente, signé, refusé. Aucune
   * transition interdite — même raison que `ProjectDocumentsService` : un
   * automate bloquerait des corrections légitimes.
   */
  async updateStatus(
    workspaceId: string,
    missionId: string,
    documentId: string,
    status: MissionDocumentStatus,
  ): Promise<MissionDocument> {
    const row = await this.documents.findOne({
      where: { id: documentId, workspace_id: workspaceId, mission_id: missionId },
    })
    if (!row) throw new NotFoundException('Document introuvable sur cette mission.')

    row.status = status
    return toMissionDocument(await this.documents.save(row))
  }

  private async assertMission(workspaceId: string, missionId: string): Promise<void> {
    const mission = await this.missions.findOne({ where: { id: missionId, workspace_id: workspaceId } })
    if (!mission) throw new NotFoundException('Mission introuvable')
  }
}
