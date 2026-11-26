import { findNameHolder } from '../contacts/contact-name-collision'
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import {
  applyFieldUpdates,
  joinSubsidiaryNames,
  parseDeclaredSubsidiaries,
  type AccountCorePatch,
  type ContactCorePatch,
  type CreateContactInput,
  type FieldSource,
  type ProvenanceEntityType,
  type RecordPatchResult,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { ProvenanceService, type FieldChange } from './provenance.service'
import { ACCOUNT_FIELD_COLUMNS, CONTACT_FIELD_COLUMNS } from './record-fields'

type AccountField = keyof typeof ACCOUNT_FIELD_COLUMNS
type ContactField = keyof typeof CONTACT_FIELD_COLUMNS

/** Une chaîne vide envoyée par un formulaire vaut « efface », pas « chaîne vide ». */
function normalize(value: unknown): unknown {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed === '' ? null : trimmed
  }
  return value
}

/**
 * Édition à la main des fiches compte et contact.
 *
 * C'est le geste qui manquait pour que Bellum soit un CRM : jusqu'ici une fiche
 * était en lecture seule, une erreur de collecte restait affichée, et personne
 * ne signale une erreur qu'il ne peut pas réparer.
 *
 * Chaque écriture passe par l'arbitre de provenance (`applyFieldUpdates`) même
 * quand elle vient d'un humain — qui gagne toujours. Ce n'est pas une
 * formalité : c'est ce passage qui ENREGISTRE la source `human`, et donc ce qui
 * empêchera le run d'analyse de cette nuit d'effacer la correction.
 */
@Injectable()
export class RecordEditService {
  private readonly logger = new Logger(RecordEditService.name)

  constructor(
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    private readonly workspaceContext: WorkspaceContextService,
    private readonly provenance: ProvenanceService,
  ) {}

  async patchAccount(userId: string, accountId: string, patch: AccountCorePatch): Promise<RecordPatchResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
    if (!account) throw new NotFoundException('Compte introuvable')

    return this.applyPatch({
      workspaceId,
      userId,
      entityType: 'account',
      entityId: accountId,
      columns: ACCOUNT_FIELD_COLUMNS,
      patch: patch as Record<string, unknown>,
      // #219.6 (#3231) — `subsidiaries` est une liste en base mais une SAISIE texte
      // pour l'arbitre : la fiche la lit jointe, le journal la garde lisible.
      row: { ...account, subsidiaries: joinSubsidiaryNames(account.subsidiaries) } as unknown as Record<
        string,
        unknown
      >,
      save: async arbitrated => {
        const accepted =
          'subsidiaries' in arbitrated
            ? { ...arbitrated, subsidiaries: parseDeclaredSubsidiaries(arbitrated.subsidiaries) }
            : arbitrated
        await this.accounts.update({ id: accountId }, accepted)
      },
    })
  }

  async patchContact(userId: string, contactId: string, patch: ContactCorePatch): Promise<RecordPatchResult> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const contact = await this.contacts.findOne({
      where: { id: contactId, workspace_id: workspaceId, deleted_at: IsNull() },
    })
    if (!contact) throw new NotFoundException('Contact introuvable')

    if (patch.assignedTo) {
      // Attribuer à quelqu'un qui n'est pas de l'espace créerait un porteur
      // fantôme : la ligne aurait un propriétaire que personne ne voit.
      await this.workspaceContext.assertMember(patch.assignedTo, workspaceId)
    }

    return this.applyPatch({
      workspaceId,
      userId,
      entityType: 'contact',
      entityId: contactId,
      columns: CONTACT_FIELD_COLUMNS,
      patch: patch as Record<string, unknown>,
      row: contact as unknown as Record<string, unknown>,
      save: async accepted => {
        // #2159.62 — corriger le TITRE ou l'ENTITÉ à la main est une
        // vérification d'emploi au même titre qu'un match fournisseur
        // (`ContactsService.enrichContact`) : seulement si l'arbitre a
        // effectivement ACCEPTÉ le champ (une valeur rejetée — identique,
        // ou une correction plus ancienne — n'a rien vérifié).
        if ('title' in accepted || 'entity' in accepted) accepted.employment_verified_at = new Date()
        await this.contacts.update({ id: contactId }, accepted)
      },
    })
  }

  /**
   * Création d'un contact à la main. `source = 'manual'` : on ne maquille pas
   * une saisie en résultat d'enrichissement, sinon les statistiques de
   * couverture des fournisseurs deviennent fausses.
   */
  async createContact(userId: string, input: CreateContactInput): Promise<ContactEntity> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)

    // #1473 — l'entreprise est FACULTATIVE. Absente, le contact est « à
    // qualifier » : un état honnête. Fournie, elle est vérifiée exactement
    // comme avant — un id d'un autre espace reste un 404, sinon on rattacherait
    // une personne au dossier d'un concurrent.
    const accountId = input.accountId ?? null
    if (accountId) {
      const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
      if (!account) throw new NotFoundException('Compte introuvable')
    }

    const email = normalize(input.email) as string | null
    if (email) {
      const duplicate = await this.contacts.findOne({
        // Sans compte, le doublon se cherche dans l'ESPACE : deux contacts « à
        // qualifier » partageant une adresse sont la même personne saisie deux
        // fois. `account_id: null` en clause TypeORM ne filtrerait rien de
        // juste — d'où la comparaison explicite.
        where: accountId
          ? { account_id: accountId, email, deleted_at: IsNull() }
          : { account_id: IsNull(), workspace_id: workspaceId, email, deleted_at: IsNull() },
      })
      // Un doublon d'adresse sur le MÊME compte est presque toujours une
      // double saisie. On refuse en le NOMMANT plutôt que de créer la
      // deuxième fiche : c'est celle-là qu'on retrouve six mois plus tard sans
      // savoir laquelle est à jour.
      if (duplicate) throw new BadRequestException(`Un contact avec cette adresse existe déjà : ${duplicate.full_name}`)
    }

    // #4479 — `idx_contacts_account_normalized_name` : un compte porte UN nom normalisé. On le dit par son
    // nom (comme l'adresse ci-dessus) plutôt que de laisser la base répondre par un 500.
    if (accountId) {
      const sameName = await findNameHolder(this.contacts, accountId, input.fullName)
      if (sameName) {
        throw new BadRequestException('Un contact portant ce nom existe déjà sur ce compte.')
      }
    }

    const saved = await this.contacts.save(
      this.contacts.create({
        account_id: accountId,
        user_id: userId,
        workspace_id: workspaceId,
        full_name: input.fullName.trim(),
        title: (normalize(input.title) as string | null) ?? null,
        entity: (normalize(input.entity) as string | null) ?? null,
        email,
        phone: (normalize(input.phone) as string | null) ?? null,
        linkedin_url: (normalize(input.linkedinUrl) as string | null) ?? null,
        source: 'manual',
        user_status: 'new',
      }),
    )

    // La provenance est posée à la création, pas seulement à la modification :
    // sans elle, le premier run d'analyse traiterait la fiche comme du
    // `pipeline` et pourrait la réécrire entièrement.
    const changes: FieldChange[] = Object.entries(CONTACT_FIELD_COLUMNS)
      .map(([field, column]) => ({
        field,
        oldValue: null,
        newValue: (saved as unknown as Record<string, unknown>)[column],
      }))
      .filter(change => change.newValue !== null && change.newValue !== undefined)

    await this.provenance.commit({
      workspaceId,
      entityType: 'contact',
      entityId: saved.id,
      source: 'human',
      actorId: userId,
      changes,
    })

    return saved
  }

  /** Suppression réversible : la ligne reste, avec sa date d'effacement. */
  async softDeleteContact(userId: string, contactId: string): Promise<{ deletedAt: string }> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const contact = await this.contacts.findOne({
      where: { id: contactId, workspace_id: workspaceId, deleted_at: IsNull() },
    })
    if (!contact) throw new NotFoundException('Contact introuvable')

    const deletedAt = new Date()
    await this.contacts.update({ id: contactId }, { deleted_at: deletedAt })
    await this.provenance.commit({
      workspaceId,
      entityType: 'contact',
      entityId: contactId,
      source: 'human',
      actorId: userId,
      changes: [{ field: 'deletedAt', oldValue: null, newValue: deletedAt }],
    })
    return { deletedAt: deletedAt.toISOString() }
  }

  /** Restaure un contact supprimé par erreur — la contrepartie qui rend la
   *  suppression réversible autrement que dans le commentaire du code. */
  async restoreContact(userId: string, contactId: string): Promise<void> {
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const contact = await this.contacts.findOne({ where: { id: contactId, workspace_id: workspaceId } })
    if (!contact) throw new NotFoundException('Contact introuvable')
    if (!contact.deleted_at) return

    await this.contacts.update({ id: contactId }, { deleted_at: null })
    await this.provenance.commit({
      workspaceId,
      entityType: 'contact',
      entityId: contactId,
      source: 'human',
      actorId: userId,
      changes: [{ field: 'deletedAt', oldValue: contact.deleted_at, newValue: null }],
    })
  }

  /** Le chemin commun : arbitrer, écrire, journaliser, rendre ce qui a bougé. */
  private async applyPatch(params: {
    workspaceId: string
    userId: string
    entityType: ProvenanceEntityType
    entityId: string
    columns: Record<string, string>
    patch: Record<string, unknown>
    row: Record<string, unknown>
    save: (accepted: Record<string, unknown>) => Promise<void>
  }): Promise<RecordPatchResult> {
    const source: FieldSource = 'human'
    const currentSources = await this.provenance.currentSources(params.entityType, params.entityId)

    const incoming: Record<string, unknown> = {}
    const current: Record<string, unknown> = {}
    for (const [field, column] of Object.entries(params.columns)) {
      if (!(field in params.patch)) continue
      incoming[field] = normalize(params.patch[field])
      current[field] = params.row[column]
    }

    const { accepted, rejected } = applyFieldUpdates({ incoming, incomingSource: source, current, currentSources })
    const acceptedFields = Object.keys(accepted)
    if (acceptedFields.length === 0) return { updated: [], rejected }

    const columnPatch: Record<string, unknown> = {}
    for (const field of acceptedFields) columnPatch[params.columns[field]] = accepted[field]
    await params.save(columnPatch)

    await this.provenance.commit({
      workspaceId: params.workspaceId,
      entityType: params.entityType,
      entityId: params.entityId,
      source,
      actorId: params.userId,
      changes: acceptedFields.map(field => ({
        field,
        oldValue: current[field],
        newValue: accepted[field],
      })),
    })

    this.logger.log('record patched', {
      entityType: params.entityType,
      entityId: params.entityId,
      fields: acceptedFields,
    })
    return { updated: acceptedFields, rejected }
  }
}

/** Exportés pour les tests de garde : la liste FERMÉE des champs éditables. */
export const EDITABLE_ACCOUNT_FIELDS = Object.keys(ACCOUNT_FIELD_COLUMNS) as AccountField[]
export const EDITABLE_CONTACT_FIELDS = Object.keys(CONTACT_FIELD_COLUMNS) as ContactField[]
