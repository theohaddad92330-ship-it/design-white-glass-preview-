import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import type { MessageDraftChannel, MessageDraftValidation, MyMessageDraftItem } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { MessageDraftArchivalEntity } from '../../database/entities/message-draft-archival.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { MessageDraftValidationEntity } from '../../database/entities/message-draft-validation.entity'
import { MessageDraftVersionEntity } from '../../database/entities/message-draft-version.entity'
import { draftContentHash } from './draft-content-hash'

/** Assez de lignes pour reconstituer les fils d'un commercial ; au-delà, les plus anciens sortent de la liste. */
const MY_DRAFTS_WINDOW = 500

/**
 * Théo B C6.N2 / M2.N1 — « Valider le brouillon » et « Mes brouillons ».
 *
 * La validation est liée à UNE version et vit dans sa propre ligne d'audit : modifier le texte ajoute une
 * version (jamais un UPDATE), donc une nouvelle relecture. Elle ne déclenche aucun envoi — « Fait » ne porte
 * jamais de preuve d'envoi, et le copilote n'envoie pas. L'empreinte couvre le contenu EFFECTIF (la correction
 * du commercial si elle existe) ; le corps n'est jamais copié.
 */
@Injectable()
export class MessageDraftValidationService {
  constructor(
    @InjectRepository(MessageDraftVersionEntity)
    private readonly versions: Repository<MessageDraftVersionEntity>,
    @InjectRepository(MessageDraftValidationEntity)
    private readonly validations: Repository<MessageDraftValidationEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(MessageDraftArchivalEntity)
    private readonly archivals: Repository<MessageDraftArchivalEntity>,
  ) {}

  /**
   * Théo B M2.R6 — « Archiver le brouillon » : une ligne d'audit liée à la version, jamais une suppression. Idempotent.
   * Une version neuve sur le même fil (le texte est retravaillé) ramène le brouillon dans la liste.
   */
  async archive(
    versionId: string,
    workspaceId: string,
    userId: string,
  ): Promise<{ versionId: string; archivedAt: string }> {
    const version = await this.versions.findOne({ where: { id: versionId, workspace_id: workspaceId } })
    if (!version) throw new NotFoundException('Brouillon introuvable dans ce workspace')
    const existing = await this.archivals.findOne({ where: { version_id: version.id, workspace_id: workspaceId } })
    if (existing) return { versionId: version.id, archivedAt: existing.created_at.toISOString() }
    const saved = await this.archivals.save(
      this.archivals.create({ workspace_id: workspaceId, version_id: version.id, archived_by: userId }),
    )
    return { versionId: version.id, archivedAt: saved.created_at.toISOString() }
  }

  async validate(versionId: string, workspaceId: string, userId: string): Promise<MessageDraftValidation> {
    const version = await this.versions.findOne({ where: { id: versionId, workspace_id: workspaceId } })
    if (!version) throw new NotFoundException('Brouillon introuvable dans ce workspace')

    const existing = await this.validations.findOne({ where: { version_id: version.id, workspace_id: workspaceId } })
    if (existing) return this.toValidation(existing)

    const saved = await this.validations.save(
      this.validations.create({
        workspace_id: workspaceId,
        version_id: version.id,
        content_hash: draftContentHash(version),
        validated_by: userId,
      }),
    )
    return this.toValidation(saved)
  }

  /** La dernière version de chaque fil (contact × canal) que CET utilisateur a préparé, la plus récente d'abord. */
  async listMine(
    workspaceId: string,
    userId: string,
    page: { limit: number; offset: number },
  ): Promise<{ items: MyMessageDraftItem[]; total: number }> {
    const rows = await this.versions.find({
      where: { workspace_id: workspaceId, recorded_by: userId },
      order: { created_at: 'DESC' },
      take: MY_DRAFTS_WINDOW,
    })
    const latestPerThread = new Map<string, MessageDraftVersionEntity>()
    const versionCounts = new Map<string, number>()
    for (const row of rows) {
      const key = `${row.contact_id}:${row.channel}`
      versionCounts.set(key, (versionCounts.get(key) ?? 0) + 1)
      if (!latestPerThread.has(key)) latestPerThread.set(key, row)
    }
    // Un fil dont la DERNIÈRE version est archivée sort de la liste ; une version neuve l'y ramène.
    const archived = latestPerThread.size
      ? await this.archivals.find({
          where: { workspace_id: workspaceId, version_id: In([...latestPerThread.values()].map(r => r.id)) },
        })
      : []
    const archivedIds = new Set(archived.map(a => a.version_id))
    const threads = [...latestPerThread.values()].filter(r => !archivedIds.has(r.id))
    const pageRows = threads.slice(page.offset, page.offset + page.limit)

    const validated = pageRows.length
      ? await this.validations.find({ where: { workspace_id: workspaceId, version_id: In(pageRows.map(r => r.id)) } })
      : []
    const validatedAt = new Map(validated.map(v => [v.version_id, v.created_at.toISOString()]))

    // Théo B M2.N1 — le contact (adresse en clair) et son compte, bornés à l'espace actif.
    const contactIds = [...new Set(pageRows.map(r => r.contact_id))]
    const contactRows = contactIds.length
      ? await this.contacts.find({ where: { workspace_id: workspaceId, id: In(contactIds) } })
      : []
    const contactById = new Map(contactRows.map(c => [c.id, c]))
    const accountIds = [...new Set(contactRows.map(c => c.account_id).filter((id): id is string => Boolean(id)))]
    const accountRows = accountIds.length ? await this.accounts.find({ where: { id: In(accountIds) } }) : []
    const accountNameById = new Map(accountRows.map(a => [a.id, a.company_name]))

    return {
      items: pageRows.map(r => {
        const contact = contactById.get(r.contact_id)
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
          validatedAt: validatedAt.get(r.id) ?? null,
          contactName: contact?.full_name ?? null,
          contactEmail: contact?.email ?? null,
          accountId: contact?.account_id ?? null,
          accountName: (contact?.account_id ? accountNameById.get(contact.account_id) : null) ?? null,
          versionCount: versionCounts.get(`${r.contact_id}:${r.channel}`) ?? 1,
        }
      }),
      total: threads.length,
    }
  }

  private toValidation(row: MessageDraftValidationEntity): MessageDraftValidation {
    return {
      versionId: row.version_id,
      contentHash: row.content_hash,
      validatedBy: row.validated_by,
      validatedAt: row.created_at.toISOString(),
    }
  }
}
