import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import type { PartnerCvPush, PartnerCvPushBrief, PartnerCvPushEconomics, PartnerCvPushOutcome } from '@bellum/contracts'
import { ConsultantEntity } from '../../database/entities/consultant.entity'
import { PartnerCvPushEntity } from '../../database/entities/partner-cv-push.entity'
import { PartnerRelationEntity } from '../../database/entities/partner-relation.entity'

/**
 * #2887 (#2371.8) — LA REVUE D'UN CV POUSSÉ À UN PARTENAIRE.
 *
 * Le brief et le TJM ne sont JAMAIS lus depuis `partner_cv_pushes` : ils sont
 * recalculés sur `consultants` à chaque appel (GA-26) — une fiche consultant
 * qui change (TJM renégocié, titre mis à jour) se reflète immédiatement, sans
 * resynchronisation à écrire.
 */
@Injectable()
export class PartnerCvPushService {
  constructor(
    @InjectRepository(PartnerCvPushEntity) private readonly repo: Repository<PartnerCvPushEntity>,
    @InjectRepository(ConsultantEntity) private readonly consultants: Repository<ConsultantEntity>,
    @InjectRepository(PartnerRelationEntity) private readonly partners: Repository<PartnerRelationEntity>,
  ) {}

  private async loadConsultant(workspaceId: string, consultantId: string): Promise<ConsultantEntity> {
    const consultant = await this.consultants.findOne({ where: { id: consultantId, workspace_id: workspaceId } })
    if (!consultant) throw new NotFoundException('Ce consultant n’existe pas dans cet espace.')
    return consultant
  }

  private async loadPartner(workspaceId: string, partnerRelationId: string): Promise<PartnerRelationEntity> {
    const partner = await this.partners.findOne({ where: { id: partnerRelationId, workspaceId } })
    if (!partner) throw new NotFoundException('Ce partenaire n’existe pas dans cet espace.')
    return partner
  }

  private briefOf(consultant: ConsultantEntity): PartnerCvPushBrief {
    return {
      consultantName: consultant.full_name ?? null,
      title: consultant.title ?? null,
      seniority: consultant.seniority,
      yearsExperience: consultant.years_experience ?? null,
    }
  }

  /** La revue AVANT toute écriture — ce que l'écran affiche avant de préparer. */
  async previewCvPush(
    workspaceId: string,
    consultantId: string,
  ): Promise<{ brief: PartnerCvPushBrief; economics: PartnerCvPushEconomics }> {
    const consultant = await this.loadConsultant(workspaceId, consultantId)
    return { brief: this.briefOf(consultant), economics: { tjm: consultant.tjm ?? null, marginSharePct: null } }
  }

  private async toView(row: PartnerCvPushEntity): Promise<PartnerCvPush> {
    const consultant = await this.consultants.findOne({
      where: { id: row.consultant_id, workspace_id: row.workspace_id },
    })
    return {
      id: row.id,
      partnerRelationId: row.partner_relation_id,
      consultantId: row.consultant_id,
      brief: consultant
        ? this.briefOf(consultant)
        : { consultantName: null, title: null, seniority: 'inconnu', yearsExperience: null },
      economics: { tjm: consultant?.tjm ?? null, marginSharePct: row.margin_share_pct ?? null },
      status: row.status as PartnerCvPush['status'],
      outcome: row.outcome as PartnerCvPushOutcome,
      createdAt: row.created_at.toISOString(),
      sentDeclaredAt: row.sent_declared_at ? row.sent_declared_at.toISOString() : null,
    }
  }

  /** PRÉPARE la revue — jamais un envoi (Laura prépare, le commercial envoie). */
  async prepareCvPush(
    workspaceId: string,
    partnerRelationId: string,
    consultantId: string,
    preparedBy: string,
  ): Promise<PartnerCvPush> {
    await this.loadPartner(workspaceId, partnerRelationId)
    await this.loadConsultant(workspaceId, consultantId)
    const row = await this.repo.save(
      this.repo.create({
        workspace_id: workspaceId,
        partner_relation_id: partnerRelationId,
        consultant_id: consultantId,
        margin_share_pct: null,
        status: 'preparee',
        outcome: 'en_attente',
        prepared_by: preparedBy,
        sent_declared_at: null,
      }),
    )
    return this.toView(row)
  }

  async listCvPushes(workspaceId: string, partnerRelationId: string): Promise<PartnerCvPush[]> {
    const rows = await this.repo.find({
      where: { workspace_id: workspaceId, partner_relation_id: partnerRelationId },
      order: { created_at: 'DESC' },
    })
    return Promise.all(rows.map(row => this.toView(row)))
  }

  private async loadOwnRow(workspaceId: string, id: string): Promise<PartnerCvPushEntity | null> {
    const row = await this.repo.findOne({ where: { id } })
    if (!row || row.workspace_id !== workspaceId) return null
    return row
  }

  /**
   * DÉCLARE le push envoyé — un geste du commercial, jamais une preuve
   * technique d'envoi (doctrine, Louis 21/09/2026).
   */
  async declareSent(workspaceId: string, id: string): Promise<PartnerCvPush | null> {
    const row = await this.loadOwnRow(workspaceId, id)
    if (!row) return null
    row.status = 'envoyee_declaree'
    row.sent_declared_at = new Date()
    const saved = await this.repo.save(row)
    return this.toView(saved)
  }

  /** Le retour du partenaire — saisi par un humain, jamais deviné. */
  async recordOutcome(workspaceId: string, id: string, outcome: PartnerCvPushOutcome): Promise<PartnerCvPush | null> {
    const row = await this.loadOwnRow(workspaceId, id)
    if (!row) return null
    row.outcome = outcome
    const saved = await this.repo.save(row)
    return this.toView(saved)
  }
}
