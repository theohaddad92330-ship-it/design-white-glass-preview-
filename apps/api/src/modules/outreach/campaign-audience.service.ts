import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Not, Raw, Repository, type FindOptionsWhere } from 'typeorm'
import {
  buildCampaignAudience,
  type AudienceCandidate,
  type CampaignAudienceEvent,
  type CampaignAudienceNeed,
  type CampaignAudienceRequest,
  type CampaignAudienceResult,
  type ContactListQuery,
} from '@bellum/contracts'
import { ActivityEntity } from '../../database/entities/activity.entity'
import { ActivityParticipantEntity } from '../../database/entities/activity-participant.entity'
import { PartnerRelationEntity } from '../../database/entities/partner-relation.entity'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import { ProjectContactEntity } from '../../database/entities/project-contact.entity'
import { ProjectNeedEntity } from '../../database/entities/project-need.entity'
import { SavedViewEntity } from '../../database/entities/saved-view.entity'
import { TargetListItemEntity } from '../../database/entities/target-list-item.entity'

/** La porte « ne me contactez plus », lue en lot — résolue par le contrôleur. */
/** #2380.61 — contact_id → raison de l'arrêt (`contact_stops.reason`). */
type StoppedAmong = (workspaceId: string, contactIds: readonly string[]) => Promise<ReadonlyMap<string, string>>

/** Les ids des contacts d'une vue enregistrée — résolus par le contrôleur (GA-07, pas de service à service). */
type ContactIdsForFilters = (workspaceId: string, filters: ContactListQuery, limit: number) => Promise<string[]>

/** Borne haute d'une audience lue en une fois — une campagne mono-contact de
 *  plus de mille personnes n'est plus une campagne, c'est un envoi de masse. */
const AUDIENCE_MAX_CANDIDATES = 1000

/** #2380.11 — les types d'activité qui sont un « événement » et le nombre proposé à l'écran. */
const AUDIENCE_EVENT_KINDS = ['meeting', 'call']
const AUDIENCE_MAX_EVENTS = 50

/**
 * Épopée #2974 (lot V39) — LE CONSTRUCTEUR D'AUDIENCE, côté lecture.
 *
 * Ce service LIT les candidats d'une source (contacts de l'espace, liste de
 * cibles, compte, opportunité, CRM, sélection explicite) et les faits qui
 * décident de leur éligibilité — arrêts (`ContactStopService.stoppedAmong`,
 * la même porte que l'armement d'une séquence, RÉSOLUE par le contrôleur
 * et passée ici en valeur : GA-07), séquences actives, comptes écartés — puis délègue TOUTE décision à `buildCampaignAudience`
 * (`@bellum/contracts`) : un seul calcul, jamais un second ici.
 *
 * Lecture seule : aucune séquence n'est armée, aucun objet audience n'est
 * créé (doctrine c74 — chaque contact de la liste sera la séquence d'UNE
 * personne, armée par le geste du commercial).
 */
@Injectable()
export class CampaignAudienceService {
  constructor(
    @InjectRepository(ContactEntity) private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(OutreachSequenceEntity) private readonly sequences: Repository<OutreachSequenceEntity>,
    @InjectRepository(TargetListItemEntity) private readonly targetItems: Repository<TargetListItemEntity>,
    @InjectRepository(ProjectContactEntity) private readonly projectContacts: Repository<ProjectContactEntity>,
    @InjectRepository(ProjectNeedEntity) private readonly needs: Repository<ProjectNeedEntity>,
    @InjectRepository(ActivityEntity) private readonly activities: Repository<ActivityEntity>,
    @InjectRepository(ActivityParticipantEntity) private readonly participants: Repository<ActivityParticipantEntity>,
    @InjectRepository(PartnerRelationEntity) private readonly partners: Repository<PartnerRelationEntity>,
    @InjectRepository(SavedViewEntity) private readonly savedViews: Repository<SavedViewEntity>,
  ) {}

  async preview(
    workspaceId: string,
    viewerId: string,
    request: CampaignAudienceRequest,
    stoppedAmong: StoppedAmong,
    contactIdsForFilters: ContactIdsForFilters,
    now: Date = new Date(),
  ): Promise<CampaignAudienceResult> {
    const rows = await this.readSource(workspaceId, request.source, contactIdsForFilters)
    const candidates = await this.toCandidates(workspaceId, rows, stoppedAmong)
    return buildCampaignAudience(candidates, request.filters, {
      now,
      viewerId,
      includeCollisions: request.include_collisions === true,
    })
  }

  /**
   * #2380.11 — les événements (réunions, appels) récents de l'espace dont au moins un participant
   * est résolu en contact : ce que le sélecteur de l'écran propose. Un événement sans personne à
   * cibler ne fait aucune ligne ; l'utilisateur lui-même ne compte pas.
   */
  async listEvents(workspaceId: string): Promise<CampaignAudienceEvent[]> {
    const events = await this.activities.find({
      where: { workspace_id: workspaceId, kind: In(AUDIENCE_EVENT_KINDS) },
      select: ['id', 'kind', 'subject', 'occurred_at'],
      order: { occurred_at: 'DESC' },
      take: AUDIENCE_MAX_EVENTS,
    })
    if (events.length === 0) return []
    const rows = await this.participants.find({
      where: { activity_id: In(events.map(event => event.id)), is_self: false, contact_id: Not(IsNull()) },
      select: ['activity_id', 'contact_id'],
    })
    const people = new Map<string, Set<string>>()
    for (const row of rows) {
      if (!row.contact_id) continue
      people.set(row.activity_id, (people.get(row.activity_id) ?? new Set()).add(row.contact_id))
    }
    return events.flatMap(event => {
      const count = people.get(event.id)?.size ?? 0
      return count > 0
        ? [
            {
              activity_id: event.id,
              kind: event.kind,
              subject: event.subject ?? null,
              occurred_at: event.occurred_at.toISOString(),
              participant_count: count,
            },
          ]
        : []
    })
  }

  /**
   * #2202.15 — les besoins non archivés de l'espace qui portent au moins une personne (demandeur ou décideur) :
   * ce que le sélecteur « besoin » propose. Un besoin sans personne à cibler ne fait aucune ligne.
   */
  async listNeeds(workspaceId: string): Promise<CampaignAudienceNeed[]> {
    const rows = await this.needs.find({
      where: { workspace_id: workspaceId, archived_at: IsNull() },
      select: ['id', 'title', 'contact_id', 'decision_maker_contact_id'],
      order: { updated_at: 'DESC' },
      take: AUDIENCE_MAX_EVENTS,
    })
    return rows.flatMap(row => {
      const people = new Set([row.contact_id, row.decision_maker_contact_id].filter((id): id is string => Boolean(id)))
      return people.size > 0 ? [{ need_id: row.id, title: row.title, contact_count: people.size }] : []
    })
  }

  private async readSource(
    workspaceId: string,
    source: CampaignAudienceRequest['source'],
    contactIdsForFilters: ContactIdsForFilters,
  ): Promise<ContactEntity[]> {
    // Un contact supprimé (T0) ou masqué sort de toutes les listes — il ne
    // fait pas non plus une ligne d'audience.
    const base: FindOptionsWhere<ContactEntity> = { workspace_id: workspaceId, deleted_at: IsNull(), hidden: false }
    const find = (where: FindOptionsWhere<ContactEntity> | FindOptionsWhere<ContactEntity>[]) =>
      this.contacts.find({ where, take: AUDIENCE_MAX_CANDIDATES, order: { full_name: 'ASC' } })

    switch (source.kind) {
      case 'workspace_contacts':
        return find(base)
      case 'crm':
        return find({ ...base, crm_record_id: Not(IsNull()) })
      case 'import':
        // #2380.8 — la provenance écrite à l'import (`ImportWriterService`), jamais devinée.
        return find({ ...base, source: 'import' })
      case 'dormant_accounts': {
        // #2380.12 — le statut commercial `dormant` du COMPTE, pas un contact « inactif » deviné.
        const dormant = await this.accounts.find({
          where: { workspace_id: workspaceId, commercial_status: 'dormant' },
          select: ['id'],
        })
        return dormant.length > 0 ? find({ ...base, account_id: In(dormant.map(account => account.id)) }) : []
      }
      case 'account':
        return find({ ...base, account_id: source.account_id })
      case 'contact_ids': {
        const rows = await find({ ...base, id: In([...new Set(source.contact_ids)]) })
        // L'ordre de la sélection (Découvrir, recherche de Laura) est gardé.
        const order = new Map(source.contact_ids.map((id, index) => [id, index]))
        return rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      }
      case 'opportunity': {
        const links = await this.projectContacts.find({
          where: { workspace_id: workspaceId, project_id: source.opportunity_id },
        })
        const ids = links.map(link => link.contact_id)
        return ids.length > 0 ? find({ ...base, id: In(ids) }) : []
      }
      case 'need': {
        // #2380.7 — les deux seuls liens contact NETS qu'un besoin porte : le
        // demandeur et le décideur. Jamais un troisième nom apparié par texte.
        const need = await this.needs.findOne({
          where: { id: source.need_id, workspace_id: workspaceId },
          select: ['id', 'contact_id', 'decision_maker_contact_id'],
        })
        if (!need) throw new NotFoundException('Besoin introuvable dans cet espace.')
        const ids = [need.contact_id, need.decision_maker_contact_id].filter((id): id is string => Boolean(id))
        return ids.length > 0 ? find({ ...base, id: In([...new Set(ids)]) }) : []
      }
      case 'event_participants': {
        // #2380.11 — l'événement doit être de CET espace ; seuls les participants que la
        // capture a résolus en contact comptent (un handle sans contact ne devient pas une
        // personne), et l'utilisateur lui-même n'est pas une cible.
        const activity = await this.activities.findOne({
          where: { id: source.activity_id, workspace_id: workspaceId },
          select: ['id'],
        })
        if (!activity) throw new NotFoundException('Événement introuvable dans cet espace.')
        const rows = await this.participants.find({
          where: { activity_id: activity.id, is_self: false, contact_id: Not(IsNull()) },
          select: ['contact_id'],
        })
        const ids = [...new Set(rows.map(row => row.contact_id).filter((id): id is string => Boolean(id)))]
        return ids.length > 0 ? find({ ...base, id: In(ids) }) : []
      }
      case 'partners': {
        // #2380.13 — le lien net entre une ESN partenaire et un contact est l'e-mail du contact
        // partenaire : égalité exacte, sans casse. Jamais un nom apparié.
        const relations = await this.partners.find({ where: { workspaceId }, select: ['contactEmail'] })
        const emails = [
          ...new Set(
            relations.map(relation => relation.contactEmail?.trim().toLowerCase()).filter((e): e is string => !!e),
          ),
        ]
        return emails.length > 0
          ? find({ ...base, email: Raw(alias => `LOWER(${alias}) IN (:...partnerEmails)`, { partnerEmails: emails }) })
          : []
      }
      case 'saved_view': {
        // #2202.12 (doctrine c74) — la vue est une SOURCE de contacts, pas un objet audience.
        // Cloisonnement : la vue se cherche AVEC le `workspace_id` ; celle d'un autre espace, une
        // vue absente ou d'un autre écran rendent la même chose — AUCUN contact, aucune erreur
        // (une 404 ici dirait qu'une vue existe ailleurs).
        const view = await this.savedViews.findOne({ where: { id: source.saved_view_id, workspace_id: workspaceId } })
        if (!view || view.scope !== 'contacts') return []
        const ids = await contactIdsForFilters(workspaceId, view.filters as ContactListQuery, AUDIENCE_MAX_CANDIDATES)
        return ids.length > 0 ? find({ ...base, id: In(ids) }) : []
      }
      case 'target_list': {
        const items = await this.targetItems.find({
          where: { workspace_id: workspaceId, target_list_id: source.target_list_id, removed_at: IsNull() },
        })
        if (items.length === 0) throw new NotFoundException('Liste de cibles introuvable ou vide dans cet espace.')
        const contactIds = items.map(item => item.contact_id).filter((id): id is string => Boolean(id))
        const accountIds = items
          .filter(item => !item.contact_id && item.account_id)
          .map(item => item.account_id as string)
        const where: FindOptionsWhere<ContactEntity>[] = []
        if (contactIds.length > 0) where.push({ ...base, id: In(contactIds) })
        if (accountIds.length > 0) where.push({ ...base, account_id: In(accountIds) })
        return where.length > 0 ? find(where) : []
      }
    }
  }

  private async toCandidates(
    workspaceId: string,
    rows: ContactEntity[],
    stoppedAmong: StoppedAmong,
  ): Promise<AudienceCandidate[]> {
    if (rows.length === 0) return []
    const contactIds = rows.map(row => row.id)
    const accountIds = [...new Set(rows.map(row => row.account_id).filter((id): id is string => Boolean(id)))]
    const [stopped, active, allSequences, accounts] = await Promise.all([
      stoppedAmong(workspaceId, contactIds),
      this.sequences.find({
        where: { workspace_id: workspaceId, contact_id: In(contactIds), status: 'active' },
        select: ['id', 'contact_id', 'user_id'],
      }),
      // #2380.53 — l'HISTORIQUE complet (tout statut), pour le plafond par contact.
      this.sequences.find({
        where: { workspace_id: workspaceId, contact_id: In(contactIds) },
        select: ['contact_id'],
      }),
      accountIds.length > 0
        ? this.accounts.find({ where: { id: In(accountIds) }, select: ['id', 'company_name', 'priority_gate'] })
        : Promise.resolve([] as AccountEntity[]),
    ])
    const activeByContact = new Map(active.map(sequence => [sequence.contact_id, sequence]))
    const priorCountByContact = new Map<string, number>()
    for (const sequence of allSequences) {
      priorCountByContact.set(sequence.contact_id, (priorCountByContact.get(sequence.contact_id) ?? 0) + 1)
    }
    const accountById = new Map(accounts.map(account => [account.id, account]))

    return rows.map(row => {
      const account = row.account_id ? accountById.get(row.account_id) : undefined
      const sequence = activeByContact.get(row.id)
      return {
        id: row.id,
        full_name: row.full_name,
        title: row.title ?? null,
        account_id: row.account_id ?? null,
        account_name: account?.company_name ?? null,
        account_parked: account?.priority_gate === 'parked',
        entity: row.entity ?? null,
        decision_role: row.decision_role ?? null,
        seniority: row.seniority ?? null,
        location: row.location ?? null,
        family: row.family ?? null,
        priority: row.priority ?? null,
        user_status: row.user_status ?? null,
        assigned_to: row.assigned_to ?? null,
        email: row.email ?? null,
        phone: row.phone ?? null,
        linkedin_url: row.linkedin_url ?? null,
        identity_confirmed: Boolean(row.identity_confirmed_at),
        last_enrichment_at: row.last_enrichment_at?.toISOString() ?? null,
        last_contacted_at: row.email_sent_at?.toISOString() ?? null,
        lifecycle_state: row.lifecycle_state ?? null,
        opted_out: stopped.has(row.id) || Boolean(row.excluded_at),
        stop_reason: stopped.get(row.id) ?? null,
        erased: Boolean(row.anonymized_at),
        active_sequence: sequence ? { sequence_id: sequence.id, owner_id: sequence.user_id } : null,
        prior_sequences_count: priorCountByContact.get(row.id) ?? 0,
      }
    })
  }
}
