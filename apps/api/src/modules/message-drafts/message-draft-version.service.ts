import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import type { CreateMessageDraftVersion, MessageDraftChannel, MessageDraftVersionItem } from '@bellum/contracts'
import { MessageDraftValidationEntity } from '../../database/entities/message-draft-validation.entity'
import { MessageDraftVersionEntity } from '../../database/entities/message-draft-version.entity'

/**
 * #3695.4/.6, #3696 — LA TRACE DU BROUILLON, EN BASE.
 *
 * Ligne d'audit : aucune méthode de correction/suppression, même doctrine que
 * `IntroductionAuthorizationService` — une nouvelle variante ou une correction
 * manuelle ajoute sa propre ligne.
 */
@Injectable()
export class MessageDraftVersionService {
  constructor(
    @InjectRepository(MessageDraftVersionEntity)
    private readonly versions: Repository<MessageDraftVersionEntity>,
    @InjectRepository(MessageDraftValidationEntity)
    private readonly validations: Repository<MessageDraftValidationEntity>,
  ) {}

  async record(
    args: CreateMessageDraftVersion & { workspaceId: string; contactId: string; recordedBy: string },
  ): Promise<MessageDraftVersionItem> {
    const row = this.versions.create({
      workspace_id: args.workspaceId,
      contact_id: args.contactId,
      channel: args.channel,
      subject: args.subject?.trim() || null,
      body: args.body,
      edited_subject: args.editedSubject?.trim() || null,
      edited_body: args.editedBody?.trim() || null,
      used_template_source: args.usedTemplateSource?.trim() || null,
      used_template_version: args.usedTemplateVersion ?? null,
      used_style_id: args.usedStyleId ?? null,
      unchanged: args.unchanged ?? false,
      angle: args.angle?.trim() || null,
      recorded_by: args.recordedBy,
    })
    const saved = await this.versions.save(row)
    return this.toItem(saved)
  }

  /** Le fil de CE contact sur CE canal, dans l'ordre d'apparition. */
  async listFor(
    contactId: string,
    workspaceId: string,
    channel: MessageDraftChannel,
  ): Promise<MessageDraftVersionItem[]> {
    const rows = await this.versions.find({
      where: { contact_id: contactId, workspace_id: workspaceId, channel },
      order: { created_at: 'ASC' },
    })
    // Théo C6.N2 — la page d'approche doit savoir QUELLE version a été relue et validée (jamais un envoi).
    const validated = rows.length
      ? await this.validations.find({ where: { workspace_id: workspaceId, version_id: In(rows.map(r => r.id)) } })
      : []
    const validatedAt = new Map(validated.map(v => [v.version_id, v.created_at.toISOString()]))
    return rows.map(r => ({ ...this.toItem(r), validatedAt: validatedAt.get(r.id) ?? null }))
  }

  private toItem(r: MessageDraftVersionEntity): MessageDraftVersionItem {
    return {
      id: r.id,
      contactId: r.contact_id,
      channel: r.channel as MessageDraftChannel,
      subject: r.subject,
      body: r.body,
      editedSubject: r.edited_subject,
      editedBody: r.edited_body,
      usedTemplateSource: r.used_template_source,
      usedTemplateVersion: r.used_template_version,
      usedStyleId: r.used_style_id,
      unchanged: r.unchanged,
      angle: r.angle,
      createdAt: r.created_at.toISOString(),
    }
  }
}
