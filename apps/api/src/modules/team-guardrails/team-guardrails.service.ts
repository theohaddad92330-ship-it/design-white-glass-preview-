import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, In, IsNull, MoreThanOrEqual, Not, Repository } from 'typeorm'
import {
  COLLEAGUE_ACTIVITY_WINDOW_DAYS,
  COLLEAGUE_CONTACT_WINDOW_DAYS,
  canEditAccountTeam,
  canEditOwnScope,
  hasPermission,
  type AccountTeamResponse,
  type AddDoNotContactRequest,
  type AlreadyProposedResponse,
  type ColleagueActivityResponse,
  type ColleagueContactCheckResponse,
  type ContactGuardrail,
  type DoNotContactEntry,
  type DuplicateCandidate,
  type WorkspaceRole,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { AccountEntityRow } from '../../database/entities/account-entity.entity'
import { BusinessUnitEntity } from '../../database/entities/business-unit.entity'
import { AccountTeamMemberEntity } from '../../database/entities/account-team-member.entity'
import { AccountTeamScopeEntity } from '../../database/entities/account-team-scope.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { DuplicatePairEntity } from '../../database/entities/duplicate-pair.entity'
import { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import { ProfileEntity } from '../../database/entities/profile.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { ShortlistEntity, ShortlistEntryEntity } from '../../database/entities/shortlist.entity'
import { ProjectEntity } from '../../database/entities/project.entity'
import { SubmissionEntity } from '../../database/entities/submission.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { WorkspaceMemberEntity } from '../../database/entities/workspace-member.entity'
import { WorkspaceDoNotContactEntity } from '../../database/entities/workspace-do-not-contact.entity'
import { normalizeLinkedinUrl } from '../contacts/contact-identity'
import { emailProvesIdentity } from '../contacts/contact-duplicate-proposals'
import {
  DECLARED_OUTREACH_STATUSES,
  VERIFIED_OUTREACH_STATUSES,
  WORK_ACTION_TYPES,
  normalizeDomain,
  pickColleagueActivities,
  pickColleagueContacts,
} from './colleague-awareness'

const DAY_MS = 86_400_000
/** « Présenté » au client : au-delà de `shortlisted` (retenu, pas proposé), hors `withdrawn`. */
const PRESENTED_SUBMISSION_STAGES = ['submitted', 'interview', 'accepted', 'rejected'] as const
const CLOSED_NEED_STATUSES = ['won', 'lost', 'cancelled', 'staffed']

/** Le contexte d'un appel : qui, dans quel espace ACTIF, avec quel rôle. Résolu par
 *  le contrôleur (`WorkspaceContextService`) — le service ne va pas chercher un
 *  autre service (GA-07). */
export type GuardrailContext = { userId: string; workspaceId: string; role: WorkspaceRole }

/**
 * #4158 (lot L4) — les garde-fous de collaboration entre collègues.
 *
 * Tout est borné par le `workspace_id` de l'espace ACTIF de l'appelant : un
 * identifiant d'un autre espace répond 404, jamais une fuite. Rien ici n'envoie,
 * ne bloque durement ni ne fusionne — on informe, on demande confirmation, on
 * PROPOSE.
 */
@Injectable()
export class TeamGuardrailsService {
  constructor(
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(UserActionEntity) private readonly actions: Repository<UserActionEntity>,
    @InjectRepository(OutreachMessageEntity) private readonly messages: Repository<OutreachMessageEntity>,
    @InjectRepository(ProfileEntity) private readonly profiles: Repository<ProfileEntity>,
    @InjectRepository(WorkspaceDoNotContactEntity) private readonly dnc: Repository<WorkspaceDoNotContactEntity>,
    @InjectRepository(AccountTeamMemberEntity) private readonly team: Repository<AccountTeamMemberEntity>,
    @InjectRepository(ProjectNeedEntity) private readonly needs: Repository<ProjectNeedEntity>,
    @InjectRepository(ShortlistEntity) private readonly shortlists: Repository<ShortlistEntity>,
    @InjectRepository(ShortlistEntryEntity) private readonly entries: Repository<ShortlistEntryEntity>,
    @InjectRepository(DuplicatePairEntity) private readonly pairs: Repository<DuplicatePairEntity>,
    @InjectRepository(SubmissionEntity) private readonly submissions: Repository<SubmissionEntity>,
    @InjectRepository(ProjectEntity) private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(WorkspaceMemberEntity) private readonly members: Repository<WorkspaceMemberEntity>,
    @InjectRepository(AccountTeamScopeEntity) private readonly scopes: Repository<AccountTeamScopeEntity>,
    @InjectRepository(AccountEntityRow) private readonly entities: Repository<AccountEntityRow>,
    @InjectRepository(BusinessUnitEntity) private readonly businessUnits: Repository<BusinessUnitEntity>,
  ) {}

  /** Nom en clair d'un utilisateur : prénom + nom, à défaut l'e-mail pro. */
  private async namesOf(userIds: readonly string[]): Promise<Map<string, string>> {
    const unique = [...new Set(userIds)].filter(Boolean)
    if (unique.length === 0) return new Map()
    const rows = await this.profiles.find({ where: { user_id: In(unique) } })
    const out = new Map<string, string>()
    for (const row of rows) {
      const full = [row.first_name, row.last_name].filter(Boolean).join(' ').trim()
      const label = full || row.email?.trim()
      if (label) out.set(row.user_id, label)
    }
    return out
  }

  private async requireAccount(workspaceId: string, accountId: string): Promise<AccountEntity> {
    const account = await this.accounts.findOne({ where: { id: accountId, workspace_id: workspaceId } })
    if (!account) throw new NotFoundException('Compte introuvable dans cet espace de travail')
    return account
  }

  private async requireContact(workspaceId: string, contactId: string): Promise<ContactEntity> {
    const contact = await this.contacts.findOne({
      where: { id: contactId, workspace_id: workspaceId, deleted_at: IsNull() },
    })
    if (!contact) throw new NotFoundException('Contact introuvable dans cet espace de travail')
    return contact
  }

  /* ------------------------------ #4158.20 ------------------------------ */

  async activityOnAccount(ctx: GuardrailContext, accountId: string): Promise<ColleagueActivityResponse> {
    const { userId, workspaceId } = ctx
    const account = await this.requireAccount(workspaceId, accountId)
    const rows = await this.actions.find({
      where: {
        workspace_id: workspaceId,
        account_id: accountId,
        action_type: In([...WORK_ACTION_TYPES]),
        created_at: MoreThanOrEqual(new Date(Date.now() - COLLEAGUE_ACTIVITY_WINDOW_DAYS * DAY_MS)),
      },
      select: ['user_id', 'action_type', 'created_at'],
      order: { created_at: 'DESC' },
      take: 500,
    })
    return this.toActivity(ctx.userId, account.assigned_to, rows)
  }

  async activityOnContact(ctx: GuardrailContext, contactId: string): Promise<ColleagueActivityResponse> {
    const { userId, workspaceId } = ctx
    const contact = await this.requireContact(workspaceId, contactId)
    const rows = await this.actions.find({
      where: {
        workspace_id: workspaceId,
        contact_id: contactId,
        action_type: In([...WORK_ACTION_TYPES]),
        created_at: MoreThanOrEqual(new Date(Date.now() - COLLEAGUE_ACTIVITY_WINDOW_DAYS * DAY_MS)),
      },
      select: ['user_id', 'action_type', 'created_at'],
      order: { created_at: 'DESC' },
      take: 500,
    })
    return this.toActivity(ctx.userId, contact.assigned_to, rows)
  }

  private async toActivity(
    me: string,
    responsibleId: string | null,
    rows: readonly Pick<UserActionEntity, 'user_id' | 'action_type' | 'created_at'>[],
  ): Promise<ColleagueActivityResponse> {
    const picked = pickColleagueActivities({ me, responsibleId, actions: rows, now: new Date() })
    const names = await this.namesOf(picked.map(p => p.user_id))
    // Pas de nom lisible = pas de ligne : « un inconnu » serait une donnée inventée.
    return {
      items: picked.flatMap(p => (names.has(p.user_id) ? [{ ...p, name: names.get(p.user_id) as string }] : [])),
    }
  }

  /* --------------------------- #4158.21 + .22 --------------------------- */

  async checkContacts(ctx: GuardrailContext, contactIds: readonly string[]): Promise<ColleagueContactCheckResponse> {
    const { userId, workspaceId } = ctx
    const contacts = await this.contacts.find({
      where: { id: In([...contactIds]), workspace_id: workspaceId, deleted_at: IsNull() },
      select: ['id', 'email', 'full_name'],
    })
    if (contacts.length === 0) return { items: [] }
    const ids = contacts.map(c => c.id)
    const now = new Date()

    const messages = await this.messages.find({
      where: {
        workspace_id: workspaceId,
        contact_id: In(ids),
        status: In([...VERIFIED_OUTREACH_STATUSES, ...DECLARED_OUTREACH_STATUSES]),
        updated_at: MoreThanOrEqual(new Date(now.getTime() - COLLEAGUE_CONTACT_WINDOW_DAYS * DAY_MS)),
      },
      select: ['contact_id', 'user_id', 'status', 'updated_at'],
    })
    const contacted = pickColleagueContacts({
      me: userId,
      messages: messages.map(m => ({
        contact_id: m.contact_id,
        user_id: m.user_id,
        status: m.status,
        at: m.updated_at,
      })),
      now,
    })

    const dncRows = await this.activeDnc(workspaceId)
    const byContact = new Map(dncRows.filter(r => r.contact_id).map(r => [r.contact_id as string, r]))
    const byDomain = new Map(dncRows.filter(r => r.domain).map(r => [r.domain as string, r]))

    const names = await this.namesOf([
      ...[...contacted.values()].map(c => c.by_user_id),
      ...dncRows.map(r => r.added_by),
    ])
    const contactNames = new Map(contacts.map(c => [c.id, c.full_name]))

    const items: ContactGuardrail[] = []
    for (const contact of contacts) {
      const emailDomain = contact.email ? normalizeDomain(contact.email) : null
      const listed = byContact.get(contact.id) ?? (emailDomain ? byDomain.get(emailDomain) : undefined)
      const colleague = contacted.get(contact.id)
      const colleagueName = colleague ? names.get(colleague.by_user_id) : undefined
      const doNotContact = listed ? this.toEntry(listed, names, contactNames) : null
      const contactedOut =
        colleague && colleagueName ? { contact_id: contact.id, by_name: colleagueName, ...colleague } : null
      // Une absence ne fait aucune ligne.
      if (!doNotContact && !contactedOut) continue
      items.push({ contact_id: contact.id, do_not_contact: doNotContact, contacted: contactedOut })
    }
    return { items }
  }

  private activeDnc(workspaceId: string): Promise<WorkspaceDoNotContactEntity[]> {
    return this.dnc.find({ where: { workspace_id: workspaceId, lifted_at: IsNull() }, order: { created_at: 'DESC' } })
  }

  private toEntry(
    row: WorkspaceDoNotContactEntity,
    names: Map<string, string>,
    contactNames: Map<string, string>,
  ): DoNotContactEntry {
    return {
      id: row.id,
      kind: row.kind,
      contact_id: row.contact_id,
      contact_name: row.contact_id ? (contactNames.get(row.contact_id) ?? null) : null,
      domain: row.domain,
      reason: row.reason,
      added_by: row.added_by,
      added_by_name: names.get(row.added_by) ?? '',
      created_at: row.created_at.toISOString(),
    }
  }

  async listDoNotContact(ctx: GuardrailContext): Promise<DoNotContactEntry[]> {
    const { userId, workspaceId } = ctx
    const rows = await this.activeDnc(workspaceId)
    const names = await this.namesOf(rows.map(r => r.added_by))
    const contactIds = rows.flatMap(r => (r.contact_id ? [r.contact_id] : []))
    const found = contactIds.length
      ? await this.contacts.find({
          where: { id: In(contactIds), workspace_id: workspaceId },
          select: ['id', 'full_name'],
        })
      : []
    const contactNames = new Map(found.map(c => [c.id, c.full_name]))
    return rows.map(r => this.toEntry(r, names, contactNames))
  }

  async addDoNotContact(ctx: GuardrailContext, input: AddDoNotContactRequest): Promise<DoNotContactEntry> {
    const { userId, workspaceId } = ctx
    let domain: string | null = null
    if (input.contact_id) {
      await this.requireContact(workspaceId, input.contact_id)
    } else {
      domain = normalizeDomain(input.domain ?? '')
      if (!domain) throw new BadRequestException('Ce domaine n’est pas valide.')
    }
    const existing = await this.dnc.findOne({
      where: input.contact_id
        ? { workspace_id: workspaceId, contact_id: input.contact_id, lifted_at: IsNull() }
        : { workspace_id: workspaceId, domain: domain as string, lifted_at: IsNull() },
    })
    if (existing) throw new ConflictException('Déjà sur la liste « ne pas contacter » de l’espace.')
    const saved = await this.dnc.save(
      this.dnc.create({
        workspace_id: workspaceId,
        kind: input.contact_id ? 'contact' : 'domain',
        contact_id: input.contact_id ?? null,
        domain,
        reason: input.reason.trim(),
        added_by: ctx.userId,
        lifted_at: null,
        lifted_by: null,
      }),
    )
    const [entry] = (await this.listDoNotContact(ctx)).filter(e => e.id === saved.id)
    return entry as DoNotContactEntry
  }

  /** Retirer = archiver (`lifted_at`), jamais supprimer. La permission `team:manage`
   *  est posée sur la route ; elle est re-vérifiée ici, la porte ne se contourne pas. */
  async liftDoNotContact(ctx: GuardrailContext, entryId: string): Promise<void> {
    const { userId, workspaceId, role } = ctx
    if (!hasPermission(role, 'team:manage')) throw new ForbiddenException('Retirer demande de gérer l’équipe.')
    const row = await this.dnc.findOne({ where: { id: entryId, workspace_id: workspaceId, lifted_at: IsNull() } })
    if (!row) throw new NotFoundException('Entrée introuvable dans cet espace de travail')
    await this.dnc.update({ id: row.id, workspace_id: workspaceId }, { lifted_at: new Date(), lifted_by: userId })
  }

  /* ------------------------------ #4158.23 ------------------------------ */

  async alreadyProposed(
    ctx: GuardrailContext,
    needId: string,
    consultantIds: readonly string[],
  ): Promise<AlreadyProposedResponse> {
    const { userId, workspaceId } = ctx
    const need = await this.needs.findOne({ where: { id: needId, workspace_id: workspaceId } })
    if (!need) throw new NotFoundException('Besoin introuvable dans cet espace de travail')
    if (consultantIds.length === 0) return { items: [] }
    const account = await this.accounts.findOne({
      where: { id: need.account_id, workspace_id: workspaceId },
      select: ['id', 'company_name'],
    })

    const openNeeds = await this.needs.find({
      where: { workspace_id: workspaceId, status: Not(In(CLOSED_NEED_STATUSES)) },
      select: ['id', 'account_id'],
    })
    const openNeedIds = new Set(openNeeds.map(n => n.id))
    const sameClientNeedIds = new Set(openNeeds.filter(n => n.account_id === need.account_id).map(n => n.id))

    const rows = await this.entries
      .createQueryBuilder('entry')
      .innerJoin(ShortlistEntity, 'shortlist', 'shortlist.id = entry.shortlist_id')
      .where('shortlist.workspace_id = :workspaceId', { workspaceId })
      .andWhere('entry.consultant_id IN (:...consultantIds)', { consultantIds: [...consultantIds] })
      .andWhere('shortlist.created_by IS NOT NULL AND shortlist.created_by <> :userId', { userId })
      .andWhere(
        new Brackets(qb =>
          qb
            .where('shortlist.need_id IN (:...needIds)', { needIds: openNeedIds.size ? [...openNeedIds] : [''] })
            .orWhere('lower(shortlist.account_name) = lower(:accountName)', {
              accountName: account?.company_name ?? '',
            }),
        ),
      )
      .select([
        'entry.consultant_id AS consultant_id',
        'shortlist.id AS shortlist_id',
        'shortlist.need_id AS need_id',
        'shortlist.need_role AS need_role',
        'shortlist.account_name AS account_name',
        'shortlist.created_by AS created_by',
        'shortlist.created_at AS created_at',
      ])
      .orderBy('shortlist.created_at', 'DESC')
      .getRawMany<{
        consultant_id: string
        need_id: string | null
        need_role: string
        account_name: string | null
        created_by: string
        created_at: Date
      }>()

    const names = await this.namesOf(rows.map(r => r.created_by))
    const seen = new Set<string>()
    const items: AlreadyProposedResponse['items'] = []
    for (const row of rows) {
      const by = names.get(row.created_by)
      if (!by || seen.has(row.consultant_id)) continue
      const sameClient =
        (row.need_id && sameClientNeedIds.has(row.need_id)) ||
        (row.account_name ?? '').toLowerCase() === (account?.company_name ?? '').toLowerCase()
      // Une fiche proposée sur CE besoin par un collègue compte aussi (même client).
      seen.add(row.consultant_id)
      items.push({
        consultant_id: row.consultant_id,
        by_user_id: row.created_by,
        by_name: by,
        account_name: row.account_name,
        need_role: row.need_role,
        at: new Date(row.created_at).toISOString(),
        relation: sameClient ? 'client' : 'need',
      })
    }
    return { items }
  }

  /**
   * #4158.23 — le même signal depuis une OPPORTUNITÉ (le « besoin » que le vivier
   * propose de pourvoir) : un collègue a-t-il déjà PRÉSENTÉ ce consultant à ce
   * client, ou sur une autre opportunité ouverte ? « Présenté » = positionné au-delà
   * de `shortlisted` (retenir un profil ne le propose pas) et non retiré.
   */
  async alreadyProposedOnProject(
    ctx: GuardrailContext,
    projectId: string,
    consultantIds: readonly string[],
  ): Promise<AlreadyProposedResponse> {
    const project = await this.projects.findOne({ where: { id: projectId, workspace_id: ctx.workspaceId } })
    if (!project) throw new NotFoundException('Opportunité introuvable dans cet espace de travail')
    if (consultantIds.length === 0) return { items: [] }
    const rows = await this.submissions
      .createQueryBuilder('s')
      .innerJoin(ProjectEntity, 'p', 'p.id = s.project_id AND p.workspace_id = s.workspace_id')
      .leftJoin(AccountEntity, 'a', 'a.id = p.account_id AND a.workspace_id = s.workspace_id')
      .where('s.workspace_id = :workspaceId', { workspaceId: ctx.workspaceId })
      .andWhere('s.consultant_id IN (:...consultantIds)', { consultantIds: [...consultantIds] })
      .andWhere('s.owner_id IS NOT NULL AND s.owner_id <> :userId', { userId: ctx.userId })
      .andWhere('s.stage IN (:...stages)', { stages: [...PRESENTED_SUBMISSION_STAGES] })
      .andWhere(
        new Brackets(qb =>
          qb.where('p.account_id = :accountId', { accountId: project.account_id }).orWhere('p.closed_at IS NULL'),
        ),
      )
      .select([
        's.consultant_id AS consultant_id',
        's.owner_id AS owner_id',
        's.created_at AS created_at',
        'p.account_id AS account_id',
        'p.label AS label',
        'a.company_name AS company_name',
      ])
      .orderBy('s.created_at', 'DESC')
      .getRawMany<{
        consultant_id: string
        owner_id: string
        created_at: Date
        account_id: string
        label: string
        company_name: string | null
      }>()
    const names = await this.namesOf(rows.map(r => r.owner_id))
    const seen = new Set<string>()
    const items: AlreadyProposedResponse['items'] = []
    for (const row of rows) {
      const by = names.get(row.owner_id)
      if (!by || seen.has(row.consultant_id)) continue
      seen.add(row.consultant_id)
      items.push({
        consultant_id: row.consultant_id,
        by_user_id: row.owner_id,
        by_name: by,
        account_name: row.company_name,
        need_role: row.label,
        at: new Date(row.created_at).toISOString(),
        relation: row.account_id === project.account_id ? 'client' : 'need',
      })
    }
    return { items }
  }

  /* ------------------------------ #4158.24 ------------------------------ */

  async duplicateCandidates(
    ctx: GuardrailContext,
    kind: 'account' | 'contact',
    id: string,
  ): Promise<DuplicateCandidate[]> {
    const { userId, workspaceId } = ctx
    return kind === 'account' ? this.accountDuplicates(workspaceId, id) : this.contactDuplicates(workspaceId, id)
  }

  private async accountDuplicates(workspaceId: string, id: string): Promise<DuplicateCandidate[]> {
    const account = await this.requireAccount(workspaceId, id)
    const domain = account.website ? normalizeDomain(account.website) : null
    const out: DuplicateCandidate[] = []
    if (domain) {
      const same = await this.accounts
        .createQueryBuilder('a')
        .where('a.workspace_id = :workspaceId AND a.id <> :id', { workspaceId, id })
        .andWhere('a.merged_into_id IS NULL')
        .andWhere('a.website ILIKE :like', { like: `%${domain}%` })
        .limit(20)
        .getMany()
      for (const other of same) {
        if (normalizeDomain(other.website ?? '') !== domain) continue
        out.push({ kind: 'account', id: other.id, label: other.company_name, reason: 'domain', owner_name: null })
      }
      await this.fillOwners(out, same)
    }
    const seen = new Set(out.map(c => c.id))
    for (const otherId of await this.pendingPairsFor(workspaceId, 'account', id)) {
      if (seen.has(otherId)) continue
      const other = await this.accounts.findOne({ where: { id: otherId, workspace_id: workspaceId } })
      if (!other) continue
      const candidate: DuplicateCandidate = {
        kind: 'account',
        id: other.id,
        label: other.company_name,
        reason: 'name_company',
        owner_name: null,
      }
      await this.fillOwners([candidate], [other])
      out.push(candidate)
    }
    return out
  }

  private async contactDuplicates(workspaceId: string, id: string): Promise<DuplicateCandidate[]> {
    const contact = await this.requireContact(workspaceId, id)
    const email = contact.email?.trim().toLowerCase() || null
    const linkedin = normalizeLinkedinUrl(contact.linkedin_url)
    const found = new Map<string, { other: ContactEntity; reason: DuplicateCandidate['reason'] }>()
    const base = () =>
      this.contacts
        .createQueryBuilder('c')
        .where('c.workspace_id = :workspaceId AND c.id <> :id AND c.deleted_at IS NULL', { workspaceId, id })
        .limit(20)
    if (email) {
      const sameEmail = await base().andWhere('lower(c.email) = :email', { email }).getMany()
      // #4600.4 — une adresse partagée qui ne PROUVE pas une identité (boîte générique, non vérifiée, portée par trois
      // fiches ou plus) ne fait pas un « doublon probable » : même règle que le balayage du compte
      // (`proposeContactDuplicates`), jamais une seconde définition.
      if (
        emailProvesIdentity(
          email,
          [contact, ...sameEmail].map(holder => ({ emailVerified: holder.email_verified })),
        )
      ) {
        for (const other of sameEmail) found.set(other.id, { other, reason: 'email' })
      }
    }
    if (linkedin) {
      const slug = linkedin.split('/').filter(Boolean).pop() ?? ''
      if (slug) {
        for (const other of await base()
          .andWhere('c.linkedin_url ILIKE :like', { like: `%${slug}%` })
          .getMany()) {
          if (normalizeLinkedinUrl(other.linkedin_url) === linkedin && !found.has(other.id)) {
            found.set(other.id, { other, reason: 'linkedin' })
          }
        }
      }
    }
    // Nom + entreprise : déjà proposé par le balayage de l'espace (`duplicate_pairs`).
    for (const otherId of await this.pendingPairsFor(workspaceId, 'contact', id)) {
      if (found.has(otherId)) continue
      const other = await this.contacts.findOne({ where: { id: otherId, workspace_id: workspaceId } })
      if (other) found.set(other.id, { other, reason: 'name_company' })
    }
    const out: DuplicateCandidate[] = [...found.values()].map(({ other, reason }) => ({
      kind: 'contact' as const,
      id: other.id,
      label: other.full_name,
      reason,
      owner_name: null,
    }))
    await this.fillOwners(
      out,
      [...found.values()].map(f => f.other),
    )
    return out
  }

  /** Les fiches rapprochées par le balayage de l'espace, paires encore EN ATTENTE. */
  private async pendingPairsFor(workspaceId: string, entityType: 'account' | 'contact', id: string): Promise<string[]> {
    const rows = await this.pairs.find({
      where: [
        { workspace_id: workspaceId, entity_type: entityType, decision: 'pending', left_id: id },
        { workspace_id: workspaceId, entity_type: entityType, decision: 'pending', right_id: id },
      ],
      take: 20,
    })
    return rows.map(r => (r.left_id === id ? r.right_id : r.left_id))
  }

  private async fillOwners(
    out: DuplicateCandidate[],
    others: readonly { id: string; assigned_to: string | null }[],
  ): Promise<void> {
    const names = await this.namesOf(others.flatMap(o => (o.assigned_to ? [o.assigned_to] : [])))
    const owner = new Map(others.map(o => [o.id, o.assigned_to]))
    for (const candidate of out) {
      const ownerId = owner.get(candidate.id)
      candidate.owner_name = ownerId ? (names.get(ownerId) ?? null) : null
    }
  }

  /** « Proposer la fusion » — première moitié : les DEUX fiches sont de l'espace actif.
   *  L'écriture de la paire (à trancher par un humain, rien de fusionné) est faite
   *  par le contrôleur via `GovernanceService.proposeDuplicates`. */
  async assertMergeProposable(
    ctx: GuardrailContext,
    kind: 'account' | 'contact',
    leftId: string,
    rightId: string,
  ): Promise<void> {
    if (leftId === rightId) throw new BadRequestException('Deux fiches distinctes sont nécessaires.')
    const check = kind === 'account' ? this.requireAccount.bind(this) : this.requireContact.bind(this)
    await check(ctx.workspaceId, leftId)
    await check(ctx.workspaceId, rightId)
  }

  /* ------------------------------ #4158.25 ------------------------------ */

  async accountTeam(ctx: GuardrailContext, accountId: string): Promise<AccountTeamResponse> {
    const { userId, workspaceId, role } = ctx
    const account = await this.requireAccount(workspaceId, accountId)
    // #4996 Q3 — le responsable n'est jamais aussi co-équipier : dédoublonné à la lecture tant que le doublon existe.
    // L8 : GARDÉ — le rattrapage (dry-run `responsibleAlsoMember`) est à la demande, jamais au déploiement : rien ne garantit un compteur nul.
    const rows = (
      await this.team.find({
        where: { workspace_id: workspaceId, account_id: accountId, removed_at: IsNull() },
        order: { created_at: 'ASC' },
      })
    ).filter(r => r.user_id !== account.assigned_to)
    const scopeRows = await this.scopes.find({
      where: { workspace_id: workspaceId, account_id: accountId, removed_at: IsNull() },
      order: { created_at: 'ASC' },
    })
    const scopesOf = (memberId: string) =>
      scopeRows
        .filter(r => r.user_id === memberId)
        .map(r => ({ id: r.id, entity_id: r.entity_id, business_unit_id: r.business_unit_id ?? null, label: r.label }))
    const names = await this.namesOf([
      ...rows.flatMap(r => [r.user_id, r.added_by]),
      ...(account.assigned_to ? [account.assigned_to] : []),
    ])
    const isMember = account.assigned_to === userId || rows.some(r => r.user_id === userId)
    return {
      responsible:
        account.assigned_to && names.has(account.assigned_to)
          ? {
              user_id: account.assigned_to,
              name: names.get(account.assigned_to) as string,
              scopes: scopesOf(account.assigned_to),
            }
          : null,
      members: rows.flatMap(r =>
        names.has(r.user_id)
          ? [
              {
                user_id: r.user_id,
                name: names.get(r.user_id) as string,
                added_by_name: names.get(r.added_by) ?? null,
                created_at: r.created_at.toISOString(),
                scopes: scopesOf(r.user_id),
              },
            ]
          : [],
      ),
      can_edit: canEditAccountTeam(role, userId, account),
      can_edit_own_scope: canEditOwnScope(role, userId, account, isMember),
    }
  }

  private async assertCanEditTeam(ctx: GuardrailContext, accountId: string): Promise<{ workspaceId: string }> {
    const { userId, workspaceId, role } = ctx
    const account = await this.requireAccount(workspaceId, accountId)
    if (!canEditAccountTeam(role, userId, account)) {
      throw new ForbiddenException(
        'Seuls le responsable du compte ou la gestion d’équipe composent l’équipe de compte.',
      )
    }
    return { workspaceId }
  }

  async addTeamMember(ctx: GuardrailContext, accountId: string, memberId: string): Promise<AccountTeamResponse> {
    const { workspaceId } = await this.assertCanEditTeam(ctx, accountId)
    const account = await this.requireAccount(workspaceId, accountId)
    // #4996 — le responsable (`assigned_to`) ne peut pas être aussi co-équipier : « qui est responsable » vit à un seul endroit.
    if (account.assigned_to === memberId) {
      throw new BadRequestException('Ce membre est déjà le responsable du compte.')
    }
    if (!(await this.members.findOne({ where: { workspace_id: workspaceId, user_id: memberId } }))) {
      throw new BadRequestException('Ce membre n’appartient pas à l’espace de travail')
    }
    const existing = await this.team.findOne({
      where: { account_id: accountId, user_id: memberId, removed_at: IsNull() },
    })
    if (!existing) {
      await this.team.save(
        this.team.create({
          workspace_id: workspaceId,
          account_id: accountId,
          user_id: memberId,
          added_by: ctx.userId,
          removed_at: null,
          removed_by: null,
        }),
      )
    }
    return this.accountTeam(ctx, accountId)
  }

  /**
   * #4996 — poser le périmètre d'un membre (responsable ou co-équipier actif). FILTRE et pré-assigne, ne bloque aucun
   * geste. Droit (Q1) : `canEditAccountTeam` pour tous, ou chaque membre du compte pour lui-même (`canEditOwnScope`).
   */
  async addTeamScope(
    ctx: GuardrailContext,
    accountId: string,
    body: { user_id: string; entity_id?: string; business_unit_id?: string; label?: string },
  ): Promise<AccountTeamResponse> {
    const { workspaceId } = ctx
    const account = await this.requireAccount(workspaceId, accountId)
    await this.assertCanEditScopeOf(ctx, account, body.user_id)
    if (!(await this.isAccountMember(workspaceId, account, body.user_id))) {
      throw new BadRequestException('Ce membre ne fait pas partie de l’équipe du compte.')
    }
    // #4996.4 — une ligne = une entité OU une BU (CHECK `account_team_scopes_entity_or_bu_check`).
    if (body.entity_id && body.business_unit_id) {
      throw new BadRequestException('Une zone est une entité OU une BU, pas les deux.')
    }
    let entityId: string | null = null
    let businessUnitId: string | null = null
    let label = (body.label ?? '').trim()
    if (body.business_unit_id) {
      // La BU doit être une BU de CET espace (jamais `where: { id }` seul) ; son nom fait le libellé.
      const unit = await this.businessUnits.findOne({ where: { id: body.business_unit_id, workspace_id: workspaceId } })
      if (!unit) throw new BadRequestException('Cette BU n’appartient pas à cet espace de travail.')
      businessUnitId = unit.id
      label = unit.name.trim()
    }
    if (body.entity_id) {
      // Le libellé vient TOUJOURS du nom de l'entité, jamais du client ; l'entité doit être CELLE de ce compte.
      const entity = await this.entities.findOne({ where: { id: body.entity_id, account_id: accountId } })
      if (!entity) throw new BadRequestException('Cette entité n’appartient pas à ce compte.')
      entityId = entity.id
      label = entity.name.trim()
    }
    if (label.length === 0) throw new BadRequestException('Une entité ou un libellé est requis.')
    const active = await this.scopes.find({
      where: { workspace_id: workspaceId, account_id: accountId, user_id: body.user_id, removed_at: IsNull() },
    })
    const already = active.some(r =>
      entityId
        ? r.entity_id === entityId
        : businessUnitId
          ? r.business_unit_id === businessUnitId
          : r.entity_id === null &&
            (r.business_unit_id ?? null) === null &&
            r.label.trim().toLowerCase() === label.toLowerCase(),
    )
    if (!already) {
      await this.scopes.save(
        this.scopes.create({
          workspace_id: workspaceId,
          account_id: accountId,
          user_id: body.user_id,
          entity_id: entityId,
          business_unit_id: businessUnitId,
          label,
          added_by: ctx.userId,
          removed_at: null,
          removed_by: null,
        }),
      )
    }
    return this.accountTeam(ctx, accountId)
  }

  /** #4996 — retirer un périmètre = l'archiver. Mêmes droits que la pose. */
  async removeTeamScope(
    ctx: GuardrailContext,
    accountId: string,
    memberId: string,
    scopeId: string,
  ): Promise<AccountTeamResponse> {
    const { workspaceId } = ctx
    const account = await this.requireAccount(workspaceId, accountId)
    await this.assertCanEditScopeOf(ctx, account, memberId)
    const scope = await this.scopes.findOne({
      where: { id: scopeId, workspace_id: workspaceId, account_id: accountId, user_id: memberId, removed_at: IsNull() },
    })
    if (!scope) throw new NotFoundException('Périmètre introuvable sur ce compte.')
    await this.scopes.update(
      { id: scopeId, workspace_id: workspaceId, account_id: accountId, user_id: memberId, removed_at: IsNull() },
      { removed_at: new Date(), removed_by: ctx.userId },
    )
    return this.accountTeam(ctx, accountId)
  }

  /** Responsable ou co-équipier actif de ce compte. */
  private async isAccountMember(workspaceId: string, account: AccountEntity, userId: string): Promise<boolean> {
    if (account.assigned_to === userId) return true
    const row = await this.team.findOne({
      where: { workspace_id: workspaceId, account_id: account.id, user_id: userId, removed_at: IsNull() },
    })
    return Boolean(row)
  }

  /** Pour soi : tout membre du compte ; pour un autre : qui compose l'équipe. Sinon 403. */
  private async assertCanEditScopeOf(
    ctx: GuardrailContext,
    account: AccountEntity,
    targetUserId: string,
  ): Promise<void> {
    const { userId, workspaceId, role } = ctx
    const allowed =
      targetUserId === userId
        ? canEditOwnScope(role, userId, account, await this.isAccountMember(workspaceId, account, userId))
        : canEditAccountTeam(role, userId, account)
    if (!allowed) {
      throw new ForbiddenException(
        'Seuls le responsable, la gestion d’équipe ou le membre lui-même posent son périmètre.',
      )
    }
  }

  /** Retirer = archiver (`removed_at`) : la ligne reste. */
  async removeTeamMember(ctx: GuardrailContext, accountId: string, memberId: string): Promise<AccountTeamResponse> {
    const { workspaceId } = await this.assertCanEditTeam(ctx, accountId)
    await this.team.update(
      { workspace_id: workspaceId, account_id: accountId, user_id: memberId, removed_at: IsNull() },
      { removed_at: new Date(), removed_by: ctx.userId },
    )
    // Un membre retiré de l'équipe n'a plus de zone : l'invariant « zone ⇒ membre du compte » tient (#4996).
    await this.scopes.update(
      { workspace_id: workspaceId, account_id: accountId, user_id: memberId, removed_at: IsNull() },
      { removed_at: new Date(), removed_by: ctx.userId },
    )
    return this.accountTeam(ctx, accountId)
  }
}
