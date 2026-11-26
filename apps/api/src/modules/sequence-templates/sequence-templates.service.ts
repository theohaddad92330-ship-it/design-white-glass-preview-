import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type {
  ContentVisibility,
  CreateOutreachStepInput,
  ImportSequenceLibraryRequest,
  ImportSequenceLibraryResult,
  SequenceBlockedStep,
  SequenceTemplate,
} from '@bellum/contracts'
import { type FindOptionsWhere, In, Repository } from 'typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { SequenceTemplateEntity, SequenceTemplateStepEntity } from '../../database/entities/sequence-template.entity'
import { readSequenceLibraryFile } from './sequence-library-parser'
import { contactVariableValues, prepareTemplateSteps } from './sequence-template-apply'

/** Le fichier voyage en base64 dans un JSON : borné. */
export const SEQUENCE_LIBRARY_MAX_BYTES = 4 * 1024 * 1024

/**
 * #3756 — la bibliothèque de modèles de séquence d'un espace. Ce service ne
 * crée AUCUNE séquence et n'envoie rien : il lit, importe, et PRÉPARE les
 * étapes pour un contact ; la création passe par `OutreachService.create`
 * (orchestrée par le contrôleur, GA-07), avec toutes ses gardes.
 */
@Injectable()
export class SequenceTemplatesService {
  constructor(
    @InjectRepository(SequenceTemplateEntity) private readonly templates: Repository<SequenceTemplateEntity>,
    @InjectRepository(SequenceTemplateStepEntity) private readonly steps: Repository<SequenceTemplateStepEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
  ) {}

  /**
   * #4158.30 — ce que `userId` peut lire : les modèles partagés de l'espace, et SES modèles personnels.
   * Le modèle personnel d'un collègue ne fait aucune ligne — même pour un manager.
   */
  private visibleWhere(workspaceId: string, userId: string, id?: string): FindOptionsWhere<SequenceTemplateEntity>[] {
    const base = { workspace_id: workspaceId, ...(id ? { id } : {}) }
    return [
      { ...base, visibility: 'team' },
      { ...base, created_by: userId },
    ]
  }

  async list(workspaceId: string, userId: string): Promise<SequenceTemplate[]> {
    const rows = await this.templates.find({
      where: this.visibleWhere(workspaceId, userId),
      order: { created_at: 'ASC', name: 'ASC' },
    })
    return this.hydrate(rows)
  }

  /**
   * #4158.30 — l'AUTEUR partage son modèle avec l'équipe, ou le reprend en personnel. Personne d'autre :
   * un modèle sans auteur connu (antérieur à la notion) reste partagé et ne se reprend pas.
   * Un modèle d'un autre espace, ou personnel d'un collègue, est un 404 — jamais confirmé.
   */
  async setVisibility(
    workspaceId: string,
    userId: string,
    id: string,
    visibility: ContentVisibility,
  ): Promise<SequenceTemplate> {
    const row = await this.templates.findOne({ where: this.visibleWhere(workspaceId, userId, id) })
    if (!row) throw new NotFoundException('Modèle introuvable.')
    if (row.created_by !== userId) {
      throw new ForbiddenException('Seul l’auteur d’un modèle peut le partager ou le reprendre en personnel.')
    }
    row.visibility = visibility
    row.updated_at = new Date()
    const [saved] = await this.hydrate([await this.templates.save(row)])
    return saved as SequenceTemplate
  }

  /**
   * Importe un fichier. Une campagne de même nom (insensible à la casse) est
   * REMPLACÉE : ré-importer la même bibliothèque ne la double pas.
   */
  async importLibrary(
    workspaceId: string,
    userId: string,
    input: ImportSequenceLibraryRequest,
  ): Promise<ImportSequenceLibraryResult> {
    const buffer = Buffer.from(input.content_base64, 'base64')
    if (buffer.length === 0) throw new BadRequestException('Le fichier est vide.')
    if (buffer.length > SEQUENCE_LIBRARY_MAX_BYTES) {
      throw new BadRequestException('Le fichier dépasse 4 Mo — scindez la bibliothèque.')
    }
    const format = input.filename.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx'
    let parsed
    try {
      parsed = await readSequenceLibraryFile(buffer, format)
    } catch {
      throw new BadRequestException('Fichier illisible : un classeur .xlsx ou un .csv est attendu.')
    }

    let stepCount = 0
    let scriptCount = 0
    for (const template of parsed.templates) {
      const existing = await this.templates
        .createQueryBuilder('t')
        // #4158.30 — on remplace une campagne de même nom parmi celles qu'on PEUT lire : jamais le modèle
        // personnel d'un collègue.
        .where(
          "t.workspace_id = :workspaceId AND lower(t.name) = lower(:name) AND (t.visibility = 'team' OR t.created_by = :userId)",
          { workspaceId, name: template.name, userId },
        )
        .getMany()
      if (existing.length > 0) await this.templates.delete({ id: In(existing.map(e => e.id)) })
      const saved = await this.templates.save(
        this.templates.create({
          workspace_id: workspaceId,
          name: template.name,
          sector: template.sector,
          tier_label: template.tier_label,
          created_by: userId,
          visibility: 'team',
        }),
      )
      await this.steps.save([
        ...template.steps.map(step => this.steps.create({ template_id: saved.id, kind: 'email', ...step })),
        // #4426.7 — les scripts d'appel de la campagne : stockés avec le modèle, hors de la cadence de mails.
        ...template.call_scripts.map(script =>
          this.steps.create({
            template_id: saved.id,
            kind: 'call_script',
            position: script.position,
            delay_days: 0,
            subject: script.title,
            body: script.body,
          }),
        ),
      ])
      stepCount += template.steps.length
      scriptCount += template.call_scripts.length
    }
    return {
      templates: parsed.templates.length,
      steps: stepCount,
      scripts: scriptCount,
      skipped: parsed.skipped,
      unknown_variables: parsed.unknownVariables,
    }
  }

  async remove(workspaceId: string, userId: string, id: string): Promise<void> {
    // #4158.30 — le modèle personnel d'un collègue n'existe pas pour moi : 404, pas 403.
    const row = await this.templates.findOne({ where: this.visibleWhere(workspaceId, userId, id) })
    if (!row) throw new NotFoundException('Modèle introuvable.')
    const result = await this.templates.delete({ id, workspace_id: workspaceId })
    if (!result.affected) throw new NotFoundException('Modèle introuvable.')
  }

  /**
   * Les étapes d'un modèle préparées pour UN contact possédé : brouillons
   * résolus, ou étape bloquée avec la variable nommée.
   */
  async prepare(
    userId: string,
    workspaceId: string,
    templateId: string,
    contactId: string,
  ): Promise<{ name: string; steps: CreateOutreachStepInput[]; blockedSteps: SequenceBlockedStep[] }> {
    const [template] = await this.hydrate(
      await this.templates.find({ where: this.visibleWhere(workspaceId, userId, templateId) }),
    )
    if (!template) throw new NotFoundException('Modèle introuvable.')
    // #4158.6 — le contact se lit dans l'ESPACE actif, plus par `user_id` seul : le
    // contact d'un collègue n'est plus « introuvable ». Un contact d'un AUTRE
    // espace reste 404. (La création de la séquence, elle, garde l'ownership
    // strict du contact — `OutreachService.create`.)
    const contact = await this.contacts.findOne({ where: { id: contactId, workspace_id: workspaceId } })
    if (!contact) throw new NotFoundException('Contact introuvable dans cet espace.')
    const account = contact.account_id
      ? await this.accounts.findOne({ where: { id: contact.account_id, workspace_id: workspaceId } })
      : null
    const profile = await this.profiles.findOne({ where: { user_id: userId } })
    const values = contactVariableValues(contact, account?.company_name ?? null, profile?.email_signature ?? null)
    return { name: template.name, ...prepareTemplateSteps(template, values) }
  }

  private async hydrate(rows: SequenceTemplateEntity[]): Promise<SequenceTemplate[]> {
    if (rows.length === 0) return []
    const steps = await this.steps.find({ where: { template_id: In(rows.map(r => r.id)) }, order: { position: 'ASC' } })
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      sector: row.sector ?? null,
      tier_label: row.tier_label ?? null,
      created_at: row.created_at.toISOString(),
      visibility: row.visibility ?? 'team',
      created_by: row.created_by ?? null,
      updated_at: row.updated_at ? row.updated_at.toISOString() : null,
      steps: steps
        .filter(s => s.template_id === row.id && (s.kind ?? 'email') === 'email')
        .map(s => ({ position: s.position, delay_days: s.delay_days, subject: s.subject, body: s.body })),
      call_scripts: steps
        .filter(s => s.template_id === row.id && s.kind === 'call_script')
        .map(s => ({ position: s.position, title: s.subject, body: s.body })),
    }))
  }
}
