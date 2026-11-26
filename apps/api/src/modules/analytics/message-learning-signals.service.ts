import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { OutreachTransitionEntity } from '../../database/entities/outreach-transition.entity'
import { OutreachMessageVersionEntity } from '../../database/entities/outreach-message-version.entity'
import { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { MessageLearningRuleProposalSnapshotEntity } from '../../database/entities/message-learning-rule-proposal-snapshot.entity'
import { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'
import {
  buildMessageLearningSummary,
  computeBehavioralMessageLearningSignals,
  computeExpressMessageLearningSignals,
  computeQualityFlagSignals,
  globalMessageLearningSignals,
  proposeCampaignMessageLearningRule,
  proposeGlobalMessageLearningRule,
  proposeMessageMessageLearningRule,
  proposeUserMessageLearningRule,
  proposeWorkspaceMessageLearningRule,
  type BehavioralMessageLearningSignals,
  type MessageLearningRuleCandidate,
  type MessageLearningRuleSnapshot,
  type MessageLearningSignals,
  type QualityFlagSignals,
} from './message-learning-signals'
import {
  SHARED_BASE_MIN_WORKSPACES,
  type MessageLearningRuleSnapshotDecision,
  type MessageLearningSummary,
} from '@bellum/contracts'

/**
 * #2385.2 (épopée #2877) — la lecture qui alimente la classification pure de
 * `message-learning-signals.ts`. Lecture SEULE sur des tables qui
 * n'appartiennent pas à ce module (`outreach_transitions`,
 * `outreach_message_versions`, `outreach_messages` du module `outreach` ;
 * `contact_stops` du module `contact-stop` ; `user_actions` du module `auth`)
 * : `Repository<T>` injecté DIRECTEMENT, jamais le SERVICE d'un autre module
 * — le motif déjà en place pour `OutreachTransitionEntity` (voir
 * `module-boundaries.spec.ts` : un repository injecté ne compte pas dans le
 * ratchet GA-07, qui ne porte que sur service → service). Les cinq
 * repositories doivent être DÉCLARÉS dans `analytics.module.ts` (GA-20).
 *
 * `result: 'applied'` exclut les transitions REFUSÉES du journal (#2366.8 les
 * trace aussi) : une approbation refusée par une garde de permission n'est pas
 * un jugement de l'utilisateur sur le message.
 */
@Injectable()
export class MessageLearningSignalsService {
  constructor(
    @InjectRepository(OutreachTransitionEntity)
    private readonly transitions: Repository<OutreachTransitionEntity>,
    @InjectRepository(OutreachMessageVersionEntity)
    private readonly versions: Repository<OutreachMessageVersionEntity>,
    // #2385.3 (LOT écrivain 28/09) — APPENDÉS EN FIN, jamais insérés au milieu
    // (les tests construisent ce service POSITIONNELLEMENT). Trois lectures
    // de plus pour `optOut`/`meetingBooked` : le contact de CHAQUE message
    // (`outreach_messages`), qui a arrêté tout envoi (`contact_stops`), et qui
    // porte un RDV obtenu (`user_actions`).
    @InjectRepository(OutreachMessageEntity)
    private readonly messages: Repository<OutreachMessageEntity>,
    @InjectRepository(ContactStopEntity)
    private readonly contactStops: Repository<ContactStopEntity>,
    @InjectRepository(UserActionEntity)
    private readonly userActions: Repository<UserActionEntity>,
    // #2385.5 (LOT écrivain 28/09, passe 2) — APPENDÉ EN FIN, même convention
    // que les cinq repositories ci-dessus. La persistance versionnée du
    // candidat de règle workspace (voir `message-learning-rule-proposal-
    // snapshot.entity.ts`), déclarée dans `analytics.module.ts` (GA-20).
    @InjectRepository(MessageLearningRuleProposalSnapshotEntity)
    private readonly proposalSnapshots: Repository<MessageLearningRuleProposalSnapshotEntity>,
    // #2385.5 (LOT écrivain 28/09, passe 2) — APPENDÉ EN FIN. Le niveau
    // CAMPAGNE lit `outreach_sequences.campaign_label` (module `outreach`,
    // repository injecté DIRECTEMENT — GA-07 ne compte pas les repositories),
    // déclaré dans `analytics.module.ts` (GA-20).
    @InjectRepository(OutreachSequenceEntity)
    private readonly sequences: Repository<OutreachSequenceEntity>,
  ) {}

  /**
   * #2385.4 (lot P06) — les signaux qualité DÉCLARÉS (faux fait, CTA, persona),
   * scopés à l'espace. Lecture SQL directe de `outreach_message_quality_flags`
   * (module `outreach`, même discipline que `sweepDeadlineAo`) : aucune
   * injection de plus, donc aucun constructeur positionnel décalé.
   */
  async qualityFlagSignals(workspaceId: string): Promise<QualityFlagSignals> {
    const rows = await this.transitions.manager.query<Array<{ kind: string; message_id: string }>>(
      'SELECT kind, message_id FROM outreach_message_quality_flags WHERE workspace_id = $1 LIMIT 20000',
      [workspaceId],
    )
    return computeQualityFlagSignals(rows)
  }

  /** #2877 — l'écran agrégat de l'ESPACE : les quatre lectures, jointes, sans corps de message. */
  async summaryForWorkspace(workspaceId: string): Promise<MessageLearningSummary> {
    const [express, behavioral, quality, proposedRule, globalRule, history] = await Promise.all([
      this.expressSignals(workspaceId),
      this.behavioralSignals(workspaceId),
      this.qualityFlagSignals(workspaceId),
      this.proposedRule(workspaceId),
      this.proposedGlobalRule(),
      this.proposedRuleHistory(workspaceId),
    ])
    return buildMessageLearningSummary({ express, behavioral, quality, proposedRule, globalRule, history })
  }

  async expressSignals(workspaceId: string): Promise<MessageLearningSignals> {
    const rows = await this.transitions.find({
      where: { ...workspaceScopeWhere(workspaceId), subject_kind: 'message', result: 'applied' },
      select: ['to_state', 'subject_id'],
      take: 20_000,
    })
    const messageIds = [...new Set(rows.map(row => row.subject_id))]
    // Passe 2 (26/09) — #2385.2 reste : « modifié » distingué de « validé tel
    // quel » via `outreach_message_versions.kind = 'user_edit'`, déjà posé par
    // `outreach-message.service.ts` à chaque édition réelle. Aucune requête de
    // version sans transition à qualifier.
    const editedMessageIds = messageIds.length
      ? new Set(
          (
            await this.versions.find({
              where: { ...workspaceScopeWhere(workspaceId), kind: 'user_edit', message_id: In(messageIds) },
              select: ['message_id'],
            })
          ).map(version => version.message_id),
        )
      : new Set<string>()
    return computeExpressMessageLearningSignals(rows, editedMessageIds)
  }

  /**
   * #2385.3 (première tranche lot g20 26/09, complétée LOT écrivain 28/09
   * — `optOut`/`meetingBooked`). Le journal donne les MESSAGES ; `optOut` et
   * `meetingBooked` vivent au niveau du CONTACT (`contact_stops`,
   * `user_actions`) — cette méthode REJOINT les deux, la fonction pure
   * (`message-learning-signals.ts`) ne fait que l'intersection.
   */
  async behavioralSignals(workspaceId: string): Promise<BehavioralMessageLearningSignals> {
    const rows = await this.transitions.find({
      where: { ...workspaceScopeWhere(workspaceId), subject_kind: 'message', result: 'applied' },
      select: ['to_state', 'subject_id', 'occurred_at'],
      take: 20_000,
    })
    const messageIds = [...new Set(rows.map(row => row.subject_id))]
    if (messageIds.length === 0) return computeBehavioralMessageLearningSignals(rows)

    // Le contact de CHAQUE message de l'échantillon — la seule jointure qui
    // manquait pour rejoindre des faits tenus AU NIVEAU DU CONTACT.
    const messageRows = await this.messages.find({
      where: { ...workspaceScopeWhere(workspaceId), id: In(messageIds) },
      select: ['id', 'contact_id'],
    })
    const contactIdByMessageId = new Map(messageRows.map(row => [row.id, row.contact_id]))
    const contactIds = [...new Set(messageRows.map(row => row.contact_id).filter(Boolean))]
    if (contactIds.length === 0) return computeBehavioralMessageLearningSignals(rows)

    const [stoppedRows, rdvRows] = await Promise.all([
      this.contactStops.find({
        where: { ...workspaceScopeWhere(workspaceId), contact_id: In(contactIds) },
        select: ['contact_id'],
      }),
      this.userActions.find({
        where: { ...workspaceScopeWhere(workspaceId), contact_id: In(contactIds), action_type: 'rdv_obtained' },
        select: ['contact_id'],
      }),
    ])
    const stoppedContactIds = new Set(stoppedRows.map(row => row.contact_id))
    const rdvContactIds = new Set(rdvRows.map(row => row.contact_id))

    const stoppedMessageIds = new Set<string>()
    const meetingBookedMessageIds = new Set<string>()
    for (const [messageId, contactId] of contactIdByMessageId) {
      if (stoppedContactIds.has(contactId)) stoppedMessageIds.add(messageId)
      if (rdvContactIds.has(contactId)) meetingBookedMessageIds.add(messageId)
    }

    return computeBehavioralMessageLearningSignals(rows, { stoppedMessageIds, meetingBookedMessageIds })
  }

  /**
   * #2385.5 (épopée #2877) — le candidat de règle au niveau workspace, dérivé
   * des deux lectures déjà servies ci-dessus. Voir le docblock de
   * `proposeWorkspaceMessageLearningRule` : un candidat calculé, jamais une
   * règle créée ni appliquée.
   */
  /**
   * #2877 (#2385.5 GLOBAL, Louis 11/10/2026) — le candidat de règle GLOBAL : il
   * ne lit QUE les cellules communes `shared_message_learning_aggregates` (k ≥ 3
   * espaces, recalculées chaque nuit par la base commune), jamais la table d'un
   * espace. Lecture SQL directe (même discipline que `qualityFlagSignals`) : la
   * base commune est une table, pas un service voisin (GA-07). Le seuil est
   * redit à la lecture, comme `readSharedCells`.
   */
  async proposedGlobalRule(): Promise<MessageLearningRuleCandidate | null> {
    const cells = await this.transitions.manager.query<Array<{ signal: string; count: number | string }>>(
      `SELECT signal, count FROM shared_message_learning_aggregates
       WHERE scope = $1 AND contributing_workspaces >= $2`,
      ['live', SHARED_BASE_MIN_WORKSPACES],
    )
    const { express, behavioral } = globalMessageLearningSignals(
      cells.map(cell => ({ signal: cell.signal, count: Number(cell.count) })),
    )
    return proposeGlobalMessageLearningRule(express, behavioral)
  }

  async proposedRule(workspaceId: string): Promise<MessageLearningRuleCandidate | null> {
    const [express, behavioral] = await Promise.all([
      this.expressSignals(workspaceId),
      this.behavioralSignals(workspaceId),
    ])
    return proposeWorkspaceMessageLearningRule(workspaceId, express, behavioral)
  }

  /**
   * #2385.5 (LOT écrivain 28/09, passe 2) — le niveau UTILISATEUR : MÊME
   * lecture qu'{@link expressSignals}, filtrée en plus par `user_id` — la
   * personne qui a approuvé ou rejeté chaque message (#2366.8, déjà posé,
   * jamais une donnée neuve). Un utilisateur reste rattaché à SON espace
   * (deux arguments, jamais un seul) : même discipline que #2385.10.
   */
  async expressSignalsForUser(workspaceId: string, userId: string): Promise<MessageLearningSignals> {
    const rows = await this.transitions.find({
      where: { ...workspaceScopeWhere(workspaceId), user_id: userId, subject_kind: 'message', result: 'applied' },
      select: ['to_state', 'subject_id'],
      take: 20_000,
    })
    const messageIds = [...new Set(rows.map(row => row.subject_id))]
    const editedMessageIds = messageIds.length
      ? new Set(
          (
            await this.versions.find({
              where: { ...workspaceScopeWhere(workspaceId), kind: 'user_edit', message_id: In(messageIds) },
              select: ['message_id'],
            })
          ).map(version => version.message_id),
        )
      : new Set<string>()
    return computeExpressMessageLearningSignals(rows, editedMessageIds)
  }

  /** #2385.5 (LOT écrivain 28/09, passe 2) — MÊME lecture qu'{@link behavioralSignals}, filtrée en plus par `user_id`. */
  async behavioralSignalsForUser(workspaceId: string, userId: string): Promise<BehavioralMessageLearningSignals> {
    const rows = await this.transitions.find({
      where: { ...workspaceScopeWhere(workspaceId), user_id: userId, subject_kind: 'message', result: 'applied' },
      select: ['to_state', 'subject_id', 'occurred_at'],
      take: 20_000,
    })
    const messageIds = [...new Set(rows.map(row => row.subject_id))]
    if (messageIds.length === 0) return computeBehavioralMessageLearningSignals(rows)

    const messageRows = await this.messages.find({
      where: { ...workspaceScopeWhere(workspaceId), id: In(messageIds) },
      select: ['id', 'contact_id'],
    })
    const contactIdByMessageId = new Map(messageRows.map(row => [row.id, row.contact_id]))
    const contactIds = [...new Set(messageRows.map(row => row.contact_id).filter(Boolean))]
    if (contactIds.length === 0) return computeBehavioralMessageLearningSignals(rows)

    const [stoppedRows, rdvRows] = await Promise.all([
      this.contactStops.find({
        where: { ...workspaceScopeWhere(workspaceId), contact_id: In(contactIds) },
        select: ['contact_id'],
      }),
      this.userActions.find({
        where: { ...workspaceScopeWhere(workspaceId), contact_id: In(contactIds), action_type: 'rdv_obtained' },
        select: ['contact_id'],
      }),
    ])
    const stoppedContactIds = new Set(stoppedRows.map(row => row.contact_id))
    const rdvContactIds = new Set(rdvRows.map(row => row.contact_id))

    const stoppedMessageIds = new Set<string>()
    const meetingBookedMessageIds = new Set<string>()
    for (const [messageId, contactId] of contactIdByMessageId) {
      if (stoppedContactIds.has(contactId)) stoppedMessageIds.add(messageId)
      if (rdvContactIds.has(contactId)) meetingBookedMessageIds.add(messageId)
    }

    return computeBehavioralMessageLearningSignals(rows, { stoppedMessageIds, meetingBookedMessageIds })
  }

  /**
   * #2385.5 (LOT écrivain 28/09, passe 2) — le candidat de règle au niveau
   * UTILISATEUR, second des 5 niveaux gouvernés à se peupler après
   * `workspace`. Même patron que {@link proposedRule}.
   */
  async proposedUserRule(workspaceId: string, userId: string): Promise<MessageLearningRuleCandidate | null> {
    const [express, behavioral] = await Promise.all([
      this.expressSignalsForUser(workspaceId, userId),
      this.behavioralSignalsForUser(workspaceId, userId),
    ])
    return proposeUserMessageLearningRule(userId, express, behavioral)
  }

  /**
   * #2385.5 (LOT écrivain 28/09, passe 2) — les messages d'UNE campagne :
   * `outreach_sequences.campaign_label` (c74, mono-contact) → leurs séquences
   * → les messages de ces séquences. Trois lectures, jamais une donnée neuve.
   * `Set` vide sans séquence portant cette étiquette — court-circuite les
   * appelants avant toute requête de transitions.
   */
  private async campaignMessageIds(workspaceId: string, campaignId: string): Promise<Set<string>> {
    const sequenceRows = await this.sequences.find({
      where: { ...workspaceScopeWhere(workspaceId), campaign_label: campaignId },
      select: ['id'],
    })
    if (sequenceRows.length === 0) return new Set()

    const sequenceIds = sequenceRows.map(row => row.id)
    const messageRows = await this.messages.find({
      where: { ...workspaceScopeWhere(workspaceId), sequence_id: In(sequenceIds) },
      select: ['id'],
    })
    return new Set(messageRows.map(row => row.id))
  }

  /** #2385.5 (LOT écrivain 28/09, passe 2) — le niveau CAMPAGNE, troisième des 5 niveaux gouvernés à se peupler. */
  async expressSignalsForCampaign(workspaceId: string, campaignId: string): Promise<MessageLearningSignals> {
    const messageIds = await this.campaignMessageIds(workspaceId, campaignId)
    if (messageIds.size === 0) return computeExpressMessageLearningSignals([])

    const rows = await this.transitions.find({
      where: {
        ...workspaceScopeWhere(workspaceId),
        subject_id: In([...messageIds]),
        subject_kind: 'message',
        result: 'applied',
      },
      select: ['to_state', 'subject_id'],
      take: 20_000,
    })
    const editedMessageIds = new Set(
      (
        await this.versions.find({
          where: { ...workspaceScopeWhere(workspaceId), kind: 'user_edit', message_id: In([...messageIds]) },
          select: ['message_id'],
        })
      ).map(version => version.message_id),
    )
    return computeExpressMessageLearningSignals(rows, editedMessageIds)
  }

  /** #2385.5 (LOT écrivain 28/09, passe 2) — MÊME lecture qu'{@link behavioralSignals}, restreinte aux messages d'une campagne. */
  async behavioralSignalsForCampaign(
    workspaceId: string,
    campaignId: string,
  ): Promise<BehavioralMessageLearningSignals> {
    const campaignMessages = await this.campaignMessageIds(workspaceId, campaignId)
    if (campaignMessages.size === 0) return computeBehavioralMessageLearningSignals([])

    const rows = await this.transitions.find({
      where: {
        ...workspaceScopeWhere(workspaceId),
        subject_id: In([...campaignMessages]),
        subject_kind: 'message',
        result: 'applied',
      },
      select: ['to_state', 'subject_id', 'occurred_at'],
      take: 20_000,
    })
    const messageIds = [...new Set(rows.map(row => row.subject_id))]
    if (messageIds.length === 0) return computeBehavioralMessageLearningSignals(rows)

    const messageRows = await this.messages.find({
      where: { ...workspaceScopeWhere(workspaceId), id: In(messageIds) },
      select: ['id', 'contact_id'],
    })
    const contactIdByMessageId = new Map(messageRows.map(row => [row.id, row.contact_id]))
    const contactIds = [...new Set(messageRows.map(row => row.contact_id).filter(Boolean))]
    if (contactIds.length === 0) return computeBehavioralMessageLearningSignals(rows)

    const [stoppedRows, rdvRows] = await Promise.all([
      this.contactStops.find({
        where: { ...workspaceScopeWhere(workspaceId), contact_id: In(contactIds) },
        select: ['contact_id'],
      }),
      this.userActions.find({
        where: { ...workspaceScopeWhere(workspaceId), contact_id: In(contactIds), action_type: 'rdv_obtained' },
        select: ['contact_id'],
      }),
    ])
    const stoppedContactIds = new Set(stoppedRows.map(row => row.contact_id))
    const rdvContactIds = new Set(rdvRows.map(row => row.contact_id))

    const stoppedMessageIds = new Set<string>()
    const meetingBookedMessageIds = new Set<string>()
    for (const [messageId, contactId] of contactIdByMessageId) {
      if (stoppedContactIds.has(contactId)) stoppedMessageIds.add(messageId)
      if (rdvContactIds.has(contactId)) meetingBookedMessageIds.add(messageId)
    }

    return computeBehavioralMessageLearningSignals(rows, { stoppedMessageIds, meetingBookedMessageIds })
  }

  /** #2385.5 (LOT écrivain 28/09, passe 2) — le candidat de règle au niveau CAMPAGNE. Même patron que {@link proposedRule}. */
  async proposedCampaignRule(workspaceId: string, campaignId: string): Promise<MessageLearningRuleCandidate | null> {
    const [express, behavioral] = await Promise.all([
      this.expressSignalsForCampaign(workspaceId, campaignId),
      this.behavioralSignalsForCampaign(workspaceId, campaignId),
    ])
    return proposeCampaignMessageLearningRule(campaignId, express, behavioral)
  }

  /**
   * #2385.5 (lot SRC4 28/09) — le niveau MESSAGE, le dernier des 5 niveaux
   * gouvernés à se peupler. MÊME lecture qu'{@link expressSignals}, restreinte
   * à UN SEUL `subject_id` au lieu d'un espace ou d'un utilisateur entier —
   * voir le docblock de `proposeMessageMessageLearningRule` : ce niveau ne
   * propose quasiment jamais de candidat en usage réel (un message n'a qu'un
   * signal express terminal), et c'est le comportement voulu (#2385.1).
   */
  async expressSignalsForMessage(workspaceId: string, messageId: string): Promise<MessageLearningSignals> {
    const rows = await this.transitions.find({
      where: { ...workspaceScopeWhere(workspaceId), subject_id: messageId, subject_kind: 'message', result: 'applied' },
      select: ['to_state', 'subject_id'],
      take: 20_000,
    })
    const editedMessageIds = rows.length
      ? new Set(
          (
            await this.versions.find({
              where: { ...workspaceScopeWhere(workspaceId), kind: 'user_edit', message_id: messageId },
              select: ['message_id'],
            })
          ).map(version => version.message_id),
        )
      : new Set<string>()
    return computeExpressMessageLearningSignals(rows, editedMessageIds)
  }

  /** #2385.5 (lot SRC4 28/09) — MÊME lecture qu'{@link behavioralSignals}, restreinte à un seul message. */
  async behavioralSignalsForMessage(workspaceId: string, messageId: string): Promise<BehavioralMessageLearningSignals> {
    const rows = await this.transitions.find({
      where: { ...workspaceScopeWhere(workspaceId), subject_id: messageId, subject_kind: 'message', result: 'applied' },
      select: ['to_state', 'subject_id', 'occurred_at'],
      take: 20_000,
    })
    if (rows.length === 0) return computeBehavioralMessageLearningSignals(rows)

    const messageRow = await this.messages.findOne({
      where: { ...workspaceScopeWhere(workspaceId), id: messageId },
      select: ['id', 'contact_id'],
    })
    if (!messageRow?.contact_id) return computeBehavioralMessageLearningSignals(rows)

    const [stoppedRows, rdvRows] = await Promise.all([
      this.contactStops.find({
        where: { ...workspaceScopeWhere(workspaceId), contact_id: messageRow.contact_id },
        select: ['contact_id'],
      }),
      this.userActions.find({
        where: { ...workspaceScopeWhere(workspaceId), contact_id: messageRow.contact_id, action_type: 'rdv_obtained' },
        select: ['contact_id'],
      }),
    ])
    return computeBehavioralMessageLearningSignals(rows, {
      stoppedMessageIds: stoppedRows.length ? new Set([messageId]) : undefined,
      meetingBookedMessageIds: rdvRows.length ? new Set([messageId]) : undefined,
    })
  }

  /** #2385.5 (lot SRC4 28/09) — le candidat de règle au niveau MESSAGE. Même patron que {@link proposedRule}. */
  async proposedMessageRule(workspaceId: string, messageId: string): Promise<MessageLearningRuleCandidate | null> {
    const [express, behavioral] = await Promise.all([
      this.expressSignalsForMessage(workspaceId, messageId),
      this.behavioralSignalsForMessage(workspaceId, messageId),
    ])
    return proposeMessageMessageLearningRule(messageId, express, behavioral)
  }

  /**
   * #2385.5 (LOT écrivain 28/09, passe 2) — enregistre le candidat ACTUEL en
   * une ligne nouvelle, jamais une mise à jour. `null` sous le seuil (comme
   * {@link proposedRule}) : on n'historise jamais un candidat qui n'existe
   * pas. Le numéro de version est `MAX(version) + 1` pour ce workspace —
   * `count` suffit ici (aucune ligne n'est jamais supprimée, donc le compte
   * ÉGALE le dernier numéro).
   */
  async recordProposedRuleSnapshot(workspaceId: string): Promise<MessageLearningRuleSnapshot | null> {
    const candidate = await this.proposedRule(workspaceId)
    if (!candidate) return null

    const previousCount = await this.proposalSnapshots.count({ where: { workspace_id: workspaceId } })
    const version = previousCount + 1
    const saved = await this.proposalSnapshots.save({
      workspace_id: workspaceId,
      level: candidate.scope.level,
      version,
      status: 'proposed',
      summary: candidate.summary,
      based_on_sample: candidate.basedOnSample,
    })
    return toSnapshotDto(saved)
  }

  /**
   * #2385.5 (LOT écrivain 28/09, passe 2) — l'historique, le plus récent
   * d'abord. Lecture seule : aucune ligne n'y est jamais modifiée ni retirée.
   */
  async proposedRuleHistory(workspaceId: string): Promise<MessageLearningRuleSnapshot[]> {
    const rows = await this.proposalSnapshots.find({
      where: { workspace_id: workspaceId },
      order: { version: 'DESC' },
    })
    return rows.map(toSnapshotDto)
  }

  /**
   * #2385.1 (épopée #2877, migration `1796405091234`) — LE geste explicite qui
   * sort un snapshot de `proposed`. Même discipline que
   * `MessageStyleService.decideRuleProposal` (#2369.8) : un snapshot déjà
   * décidé ne se redécide pas (`ConflictException`), un snapshot inconnu ne se
   * devine pas (`NotFoundException`). Adopter/refuser une règle apprise reste
   * une décision d'OPÉRATEUR (ce contrôleur est back-office, cross-tenant,
   * `InternalSecretGuard`) — il n'y a pas d'utilisateur d'espace à qui
   * attribuer la décision, contrairement à `message_style_rule_proposals`.
   */
  async decideProposedRuleSnapshot(
    workspaceId: string,
    version: number,
    decision: MessageLearningRuleSnapshotDecision,
  ): Promise<MessageLearningRuleSnapshot> {
    const row = await this.proposalSnapshots.findOne({ where: { workspace_id: workspaceId, version } })
    if (!row) {
      throw new NotFoundException(`Aucun snapshot de règle apprise en version ${version} pour cet espace.`)
    }
    if (row.status !== 'proposed') {
      throw new ConflictException('Ce snapshot a déjà été décidé.')
    }
    row.status = decision
    row.decided_at = new Date()
    const saved = await this.proposalSnapshots.save(row)
    return toSnapshotDto(saved)
  }
}

function toSnapshotDto(row: MessageLearningRuleProposalSnapshotEntity): MessageLearningRuleSnapshot {
  return {
    version: row.version,
    status: row.status as MessageLearningRuleSnapshot['status'],
    summary: row.summary,
    basedOnSample: row.based_on_sample,
    createdAt: (row.created_at ?? new Date()).toISOString(),
    decidedAt: row.decided_at ? row.decided_at.toISOString() : null,
  }
}
