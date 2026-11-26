import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, LessThanOrEqual, Not, Repository } from 'typeorm'
import {
  type DelegationScope,
  OUTREACH_EDIT_POLICY,
  OUTREACH_MESSAGE_FROZEN_STATES,
  checkOutreachTransition,
  hasPermission,
  isMinorOutreachEdit,
  outreachApprovalView,
  outreachAssetGate,
  outreachContentBlockers,
  outreachContextBlockers,
  type OutreachContextInput,
  type ApproveOutreachMessagesRequest,
  type ApproveOutreachMessagesResult,
  type ContactApolloDetails,
  type CreateOutreachCallTaskRequest,
  type CreateOutreachMessageRequest,
  type OutreachActorKind,
  type OutreachApprovalView,
  type OutreachBlocker,
  type OutreachCallTask,
  readRecentSignals,
  type OutreachMessageChannel,
  type OutreachMessage,
  type OutreachQualityFlagKind,
  type OutreachMessageStatus,
  type OutreachRisk,
  type OutreachTransition,
  type ReviseOutreachMessageRequest,
  type TransitionOutreachRequest,
  type WorkspacePermission,
  type WorkspaceRole,
} from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactEntity } from '../../database/entities/contact.entity'
import { MessageStyleTemplateEntity } from '../../database/entities/message-style-template.entity'
import { OutreachAssetEntity } from '../../database/entities/outreach-asset.entity'
import { OutreachCallTaskEntity } from '../../database/entities/outreach-call-task.entity'
import { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import { OutreachMessageQualityFlagEntity } from '../../database/entities/outreach-message-quality-flag.entity'
import { OutreachMessageVersionEntity } from '../../database/entities/outreach-message-version.entity'
import { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import { OutreachTransitionEntity } from '../../database/entities/outreach-transition.entity'
import { contactSourceTag } from '../analysis/contact-score'
import { workspaceScopeWhere } from '../workspace/workspace-scoping'

/** Qui agit, dans quel espace, avec quel rôle — résolu par le contrôleur. */
export type OutreachCtx = { userId: string; workspaceId: string; role: WorkspaceRole }

/**
 * Les contacts arrêtés (opt-out) parmi ceux-ci. Fournie par le contrôleur
 * (`ContactStopService.stoppedAmong`) : ce service ne va chercher aucun autre
 * service (GA-07), l'orchestration vit dans le contrôleur.
 */
export type StopLookup = (contactIds: readonly string[]) => Promise<ReadonlySet<string>>

/**
 * #2366 — le modèle canonique de l'outreach : un message préparé, ses
 * versions, sa machine à quinze états, son journal de transitions ; la tâche
 * d'appel et sa machine à douze états. #2382 — le centre d'approbation lit ce
 * même objet (vues, bloquants, preuve, délégation, validation en lot).
 *
 * AUCUNE route de ce service n'envoie quoi que ce soit : « validé » n'est
 * jamais « exécuté », l'envoi reste le geste humain du send-email existant.
 */
/** Les états où un appel est clos : plus rien à reporter. */
const CLOSED_CALL_STATUSES: readonly string[] = [
  'completed',
  'no_answer',
  'wrong_person',
  'qualified',
  'refused',
  'cancelled',
]

@Injectable()
export class OutreachMessageService {
  constructor(
    @InjectRepository(OutreachMessageEntity)
    private readonly messages: Repository<OutreachMessageEntity>,
    @InjectRepository(OutreachMessageVersionEntity)
    private readonly versions: Repository<OutreachMessageVersionEntity>,
    @InjectRepository(OutreachCallTaskEntity)
    private readonly calls: Repository<OutreachCallTaskEntity>,
    @InjectRepository(OutreachTransitionEntity)
    private readonly transitions: Repository<OutreachTransitionEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectRepository(AccountEntity)
    private readonly accounts: Repository<AccountEntity>,
    @InjectRepository(OutreachAssetEntity)
    private readonly assets: Repository<OutreachAssetEntity>,
    @InjectRepository(OutreachSequenceEntity)
    private readonly sequences: Repository<OutreachSequenceEntity>,
    @InjectRepository(MessageStyleTemplateEntity)
    private readonly styleTemplates: Repository<MessageStyleTemplateEntity>,
    // #2877 (#2385.4) — APPENDÉ EN FIN : un paramètre inséré au milieu
    // décalerait en silence un appelant qui construit par position.
    @InjectRepository(OutreachMessageQualityFlagEntity)
    private readonly qualityFlags: Repository<OutreachMessageQualityFlagEntity>,
  ) {}

  /* ------------------------------- messages ------------------------------- */

  /**
   * Prépare un message. Il naît `needs_review` : préparé n'est jamais envoyé,
   * et rien ne se valide sans qu'un humain l'ait lu. Le gabarit d'origine est
   * gardé en version 1 quand il existe (#2382.3 — diff à trois versions).
   */
  async create(
    ctx: OutreachCtx,
    dto: CreateOutreachMessageRequest,
    stops: StopLookup,
    actorKind: OutreachActorKind = 'user',
    link: { sequence_id: string; sequence_step_id: string } | null = null,
  ): Promise<OutreachMessage> {
    const contact = await this.contacts.findOne({
      where: { id: dto.contact_id, ...workspaceScopeWhere(ctx.workspaceId) },
    })
    if (!contact) throw new NotFoundException('Contact introuvable dans cet espace.')

    const assetId = dto.asset_id ?? null
    if (assetId) await this.assertAssetJoinable(ctx, assetId, contact.id)

    const style = await this.resolveAppliedStyle(ctx, dto.message_style_template_id ?? null)

    const message = await this.messages.save(
      this.messages.create({
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        contact_id: contact.id,
        channel: dto.channel,
        intent: dto.intent,
        source: dto.source,
        reason: dto.reason ?? null,
        status: 'needs_review',
        current_version: dto.template ? 2 : 1,
        sequence_id: link?.sequence_id ?? null,
        sequence_step_id: link?.sequence_step_id ?? null,
        outreach_asset_id: assetId,
        approval: null,
        message_style_template_id: style?.id ?? null,
        message_style_template_version: style?.version ?? null,
      }),
    )
    let version = 1
    if (dto.template) {
      await this.saveVersion(ctx, message.id, version++, 'template', dto.template.subject, dto.template.body, null)
    }
    await this.saveVersion(
      ctx,
      message.id,
      version,
      'personalized',
      dto.subject,
      dto.body,
      actorKind === 'user' ? ctx.userId : null,
    )
    await this.log(ctx, 'message', message.id, null, 'needs_review', actorKind, 'created', {
      tool: 'outreach.messages.create',
      permission: 'messages:send',
    })
    return this.toDto(ctx, message, await stops([message.contact_id]))
  }

  /**
   * #2382.1/.2/.3 — RÉFUTÉ en prod le 23/09 : le contrôleur n'écrivait le
   * message canonique d'une étape e-mail qu'À LA CRÉATION de la séquence
   * (`create`/`duplicate`) — jamais quand une étape e-mail était ajoutée
   * APRÈS coup (`addStep`), le cas courant d'une séquence construite au fil
   * de l'eau. Cette liste sert l'idempotence : ne jamais recréer un message
   * pour une étape déjà liée.
   */
  async linkedStepIds(ctx: OutreachCtx, sequenceId: string): Promise<Set<string>> {
    const rows = await this.messages.find({
      where: { sequence_id: sequenceId, ...workspaceScopeWhere(ctx.workspaceId) },
      select: ['sequence_step_id'],
    })
    const ids = rows.map(r => r.sequence_step_id).filter((id): id is string => id !== null)
    return new Set(ids)
  }

  /**
   * #2366.1 — `contactId` optionnel : la fiche Contact lit le MÊME objet que
   * le centre d'approbation, filtré à un contact, jamais une copie propre à
   * l'écran.
   */
  async list(
    ctx: OutreachCtx,
    stops: StopLookup,
    view?: OutreachApprovalView,
    contactId?: string,
  ): Promise<OutreachMessage[]> {
    const rows = await this.messages.find({
      where: { ...workspaceScopeWhere(ctx.workspaceId), ...(contactId ? { contact_id: contactId } : {}) },
      order: { updated_at: 'DESC' },
    })
    if (rows.length === 0) return []
    const stopped = await stops(rows.map(r => r.contact_id))
    const dtos = await this.toDtos(ctx, rows, stopped)
    return view ? dtos.filter(d => d.view === view) : dtos
  }

  async get(ctx: OutreachCtx, id: string, stops: StopLookup): Promise<OutreachMessage> {
    const message = await this.owned(ctx, id)
    return this.toDto(ctx, message, await stops([message.contact_id]))
  }

  /**
   * #2366.10 / #2382.6 — une modification crée une version. Substantielle sur
   * un message validé ou planifié, elle INVALIDE l'approbation et le renvoie à
   * relire ; une retouche d'espaces (policy `whitespace_only_is_minor`) la garde.
   * Un message parti ne se réécrit pas.
   */
  async revise(
    ctx: OutreachCtx,
    id: string,
    dto: ReviseOutreachMessageRequest,
    stops: StopLookup,
  ): Promise<OutreachMessage> {
    const message = await this.owned(ctx, id)
    this.assertCanEdit(ctx, message)
    if (OUTREACH_MESSAGE_FROZEN_STATES.has(message.status)) {
      throw new ConflictException('Ce message est parti : il ne se réécrit pas. Préparez-en un nouveau.')
    }
    if (dto.base_version !== message.current_version) {
      throw new ConflictException('Ce message a été modifié entre-temps : rechargez-le avant de le retoucher.')
    }
    const current = await this.versions.findOne({ where: { message_id: message.id, version: message.current_version } })
    const previous = { subject: current?.subject ?? null, body: current?.body ?? '' }
    if (previous.subject === dto.subject && previous.body === dto.body) {
      return this.toDto(ctx, message, await stops([message.contact_id]))
    }

    const next = message.current_version + 1
    await this.saveVersion(ctx, message.id, next, 'user_edit', dto.subject, dto.body, ctx.userId)
    message.current_version = next

    const substantive = !isMinorOutreachEdit(previous, dto)
    if (
      substantive &&
      (message.status === 'approved' || message.status === 'scheduled' || message.status === 'failed')
    ) {
      // #2382.6 — « Une modification substantielle invalide l'approbation. »
      await this.move(ctx, message, 'needs_review', 'user', 'substantive_edit_invalidates_approval', null, {
        tool: 'outreach.messages.revise',
      })
      message.approval = null
    }
    await this.messages.save(message)
    return this.toDto(ctx, message, await stops([message.contact_id]))
  }

  /**
   * #2382.9 — « Valider tout » ne valide QUE ce qui a été affiché : chaque
   * élément porte la version vue, et un message modifié depuis est EXCLU, pas
   * validé. Un bloqué (opt-out, canal absent, message vide) est exclu aussi,
   * comme un message que le lecteur n'a pas le droit de valider (#2382.7).
   */
  async approveMany(
    ctx: OutreachCtx,
    dto: ApproveOutreachMessagesRequest,
    stops: StopLookup,
  ): Promise<ApproveOutreachMessagesResult> {
    const ids = [...new Set(dto.items.map(i => i.id))]
    const rows = await this.messages.find({ where: { id: In(ids), ...workspaceScopeWhere(ctx.workspaceId) } })
    const byId = new Map(rows.map(r => [r.id, r]))
    const stopped = await stops(rows.map(r => r.contact_id))
    const contacts = await this.contactsById(ctx, rows)
    const accounts = await this.accountsByContact(contacts.values())
    const contexts = await this.contextsFor(ctx, rows, contacts, accounts)
    const result: ApproveOutreachMessagesResult = { approved: [], excluded: [] }

    for (const item of dto.items) {
      const message = byId.get(item.id)
      if (!message) {
        result.excluded.push({ id: item.id, reason: 'not_found' })
        continue
      }
      if (!this.canApprove(ctx, message)) {
        result.excluded.push({ id: item.id, reason: 'forbidden' })
        continue
      }
      if (message.status !== 'needs_review' && message.status !== 'drafted') {
        result.excluded.push({ id: item.id, reason: 'not_reviewable' })
        continue
      }
      if (message.current_version !== item.version) {
        result.excluded.push({ id: item.id, reason: 'changed_since_display' })
        continue
      }
      const body = (
        await this.versions.findOne({ where: { message_id: message.id, version: message.current_version } })
      )?.body
      const contact = contacts.get(message.contact_id) ?? null
      const account = contact?.account_id ? (accounts.get(contact.account_id) ?? null) : null
      const blockers = blockersOf(message, contact, account, body ?? '', stopped, contexts.get(message.id))
      if (blockers.length > 0) {
        result.excluded.push({ id: item.id, reason: 'blocked' })
        continue
      }
      if (message.status === 'drafted') {
        await this.move(ctx, message, 'needs_review', 'user', 'submitted_for_review', null, {
          tool: 'outreach.messages.approve',
        })
      }
      await this.move(ctx, message, 'approved', 'user', dto.items.length > 1 ? 'batch_approval' : 'approval', null, {
        tool: 'outreach.messages.approve',
        permission: this.requiredPermission(ctx, message),
      })
      // #2382.8 — la preuve : auteur, date, version, audience, policy, coût, conditions.
      message.approval = {
        author: ctx.userId,
        date: new Date().toISOString(),
        version: message.current_version,
        audience: { kind: 'contact', contact_ids: [message.contact_id], size: 1 },
        policy: OUTREACH_EDIT_POLICY,
        // Aucun coût n'est mesuré par message aujourd'hui : `null`, jamais 0 (GA-18).
        cost: null,
        conditions: [
          'no_blocker',
          `displayed_version:${item.version}`,
          `permission:${this.requiredPermission(ctx, message)}`,
        ],
      }
      await this.messages.save(message)
      result.approved.push(message.id)
    }
    return result
  }

  /* --------------------------- dispatcher (#3069) -------------------------- */

  /**
   * #3069 — les messages VALIDÉS (une décision humaine déjà prise, preuve dans
   * `approval`) qu'aucun envoi n'a encore repris. C'est la population du
   * dispatcher : jamais `needs_review` (personne n'a validé ce texte).
   *
   * INTER-ESPACES à dessein, comme `StorageService.purgeExpired` : c'est un
   * balayage d'exploitation, pas une lecture de locataire. Chaque ligne porte
   * déjà son `workspace_id`, que les méthodes de ce dispatcher relisent une à
   * une — aucune n'agrège entre espaces.
   */
  async listApproved(limit: number): Promise<OutreachMessageEntity[]> {
    return this.messages.find({
      where: { status: 'approved' },
      order: { updated_at: 'ASC' },
      take: limit,
    })
  }

  /**
   * #3069 — ce que le dispatcher a besoin de savoir pour agir sur UN message :
   * le canal, le texte FIGÉ de la version validée (jamais recalculé), et
   * l'adresse du canal — jamais devinée, lue sur le contact comme
   * {@link blockersOf} le fait déjà pour `missing_channel_address`.
   */
  async dispatchPayload(
    workspaceId: string,
    message: OutreachMessageEntity,
  ): Promise<{ channel: OutreachMessageChannel; address: string | null; subject: string | null; body: string }> {
    const current = await this.versions.findOne({
      where: { message_id: message.id, version: message.current_version },
    })
    const contact = await this.contacts.findOne({ where: { id: message.contact_id, workspace_id: workspaceId } })
    const address =
      message.channel === 'email'
        ? (contact?.email ?? null)
        : message.channel === 'linkedin'
          ? (contact?.linkedin_url ?? null)
          : message.channel === 'phone'
            ? (contact?.phone ?? null)
            : null
    return { channel: message.channel, address, subject: current?.subject ?? null, body: current?.body ?? '' }
  }

  /**
   * #3069 — le dispatcher s'annonce : `approved` → `sending`, juste AVANT
   * l'appel réel au connecteur. Le SEUL appelant système de ce mouvement — un
   * modèle ne peut pas l'atteindre (`MODEL_ALLOWED_TARGETS`), et cette méthode
   * n'accepte que `actor: 'system'`, jamais `'model'`.
   *
   * Rend `null` si la machine refuse (message déjà repris par un autre passage,
   * ou déjà dans un état gelé) — le dispatcher passe au message suivant, il ne
   * réessaie pas une transition refusée.
   */
  async markSending(workspaceId: string, id: string): Promise<OutreachMessageEntity | null> {
    const message = await this.messages.findOne({ where: { id, workspace_id: workspaceId } })
    if (!message) return null
    const check = checkOutreachTransition('message', message.status, 'sending', 'system')
    if (!check.ok) return null
    const from = message.status
    message.status = 'sending'
    await this.messages.save(message)
    await this.logSystem(workspaceId, message, from, 'sending', 'dispatcher_send_attempt', null)
    return message
  }

  /**
   * #3069 — le connecteur a CONFIRMÉ l'envoi. `proof` porte ce que le
   * connecteur a rendu (jamais inventé) — `checkOutreachTransition` exige une
   * preuve non vide pour atteindre `sent` (`PROOF_REQUIRED_TARGETS`), la même
   * règle qui protège `delivered`/`bounced`/`replied`.
   */
  async markSent(workspaceId: string, id: string, proof: Record<string, unknown>): Promise<void> {
    const message = await this.messages.findOne({ where: { id, workspace_id: workspaceId } })
    if (!message) return
    const check = checkOutreachTransition('message', message.status, 'sent', 'system', proof)
    if (!check.ok) return
    const from = message.status
    message.status = 'sent'
    // #3234 — les identifiants du fournisseur (la clé d'appariement des réponses)
    // vivent aussi en colonne ; jamais le corps, jamais une valeur devinée.
    const providerMessageId = proof['providerMessageId']
    const providerThreadId = proof['providerThreadId']
    if (typeof providerMessageId === 'string' && providerMessageId) message.provider_message_id = providerMessageId
    if (typeof providerThreadId === 'string' && providerThreadId) message.provider_thread_id = providerThreadId
    await this.messages.save(message)
    await this.logSystem(workspaceId, message, from, 'sent', 'dispatcher_send_confirmed', proof)
  }

  /**
   * #3069 — le connecteur a REFUSÉ ou l'appel a levé une exception. `failed`
   * reste repris (`sending` → `failed` → `sending`, #2366.10) : un passage
   * suivant du dispatcher peut retenter, jamais un faux succès entre-temps.
   */
  async markSendFailed(workspaceId: string, id: string, reason: string): Promise<void> {
    const message = await this.messages.findOne({ where: { id, workspace_id: workspaceId } })
    if (!message) return
    const check = checkOutreachTransition('message', message.status, 'failed', 'system')
    if (!check.ok) return
    const from = message.status
    message.status = 'failed'
    await this.messages.save(message)
    await this.logSystem(workspaceId, message, from, 'failed', reason, null)
  }

  /**
   * #3702.9 — rattache à un mandat des messages DÉJÀ validés (preuve humaine
   * posée par `approveMany`) : la condition `delegation:<id>` dans la preuve est
   * ce qui fait passer le dispatcher par la porte du mandat. Ne valide rien :
   * un message qui n'est pas `approved` n'est jamais touché. Rend les ids taggés.
   */
  async tagDelegation(
    workspaceId: string,
    delegationId: string,
    items: readonly { id: string; version: number }[],
  ): Promise<string[]> {
    const tagged: string[] = []
    for (const item of items) {
      const message = await this.messages.findOne({ where: { id: item.id, workspace_id: workspaceId } })
      if (!message?.approval || message.status !== 'approved' || message.current_version !== item.version) continue
      const conditions = message.approval.conditions.filter(c => !c.startsWith('delegation:'))
      message.approval = { ...message.approval, conditions: [...conditions, `delegation:${delegationId}`] }
      await this.messages.save(message)
      tagged.push(message.id)
    }
    return tagged
  }

  /** #3702.3 — le mandat s'arrête sur un fait du contact : le message n'attend plus, il est annulé (journalisé). */
  async cancelByDelegation(workspaceId: string, id: string, reason: string): Promise<void> {
    const message = await this.messages.findOne({ where: { id, workspace_id: workspaceId } })
    if (!message) return
    const check = checkOutreachTransition('message', message.status, 'cancelled', 'system')
    if (!check.ok) return
    const from = message.status
    message.status = 'cancelled'
    await this.messages.save(message)
    await this.logSystem(workspaceId, message, from, 'cancelled', `delegation_stop:${reason}`, null)
  }

  /**
   * #4016 L5 — un message préparé par un USAGE (Laura, relance d'impayé, suivi
   * de rendez-vous, séquence de l'espace) ATTEND un mandat de cette portée. Ne
   * valide rien : le message reste en relecture, visible au centre
   * d'approbation, et un humain peut toujours le valider lui-même. Seul le
   * dispatcher, s'il trouve un mandat ACTIF au moment de l'envoi, le fera partir.
   */
  async awaitMandate(workspaceId: string, id: string, scope: DelegationScope, originatedAt: Date): Promise<void> {
    const message = await this.messages.findOne({ where: { id, workspace_id: workspaceId } })
    if (!message) return
    message.mandate_scope = scope
    message.mandate_originated_at = originatedAt
    await this.messages.save(message)
  }

  /**
   * #4016 L5 — la population « attend un mandat » du dispatcher : préparés,
   * jamais validés par personne, rattachés à une portée. Inter-espaces à dessein
   * (même raison que {@link listApproved}) ; chaque ligne porte son espace.
   */
  async listAwaitingMandate(limit: number, now: Date = new Date()): Promise<OutreachMessageEntity[]> {
    return this.messages.find({
      where: {
        status: In(['drafted', 'needs_review']),
        mandate_scope: Not(IsNull()),
        // #4016 L5 (reprise 20/10) — seulement les ÉCHUS : une étape de séquence à J+3 n'entre qu'à J+3.
        mandate_originated_at: LessThanOrEqual(now),
      },
      order: { updated_at: 'ASC' },
      take: limit,
    })
  }

  /**
   * #4016 L5 (reprise 20/10) — aucun mandat ne couvrira plus ce message (révoqué,
   * expiré, né avant la signature) : il quitte la file du dispatcher et reste
   * EN RELECTURE, comme tout message préparé — un humain le valide d'un clic.
   * Ne change pas son statut, n'envoie rien.
   */
  async releaseMandate(workspaceId: string, id: string): Promise<void> {
    await this.messages.update({ id, workspace_id: workspaceId }, { mandate_scope: null, mandate_originated_at: null })
  }

  /**
   * #4016 L5 — le mandat VALIDE à la place du clic, pour CE message, à l'instant
   * de l'envoi. Les MÊMES bloquants que `approveMany` (opt-out, adresse, vide,
   * qualité, contexte) : un mandat ne rachète pas un message bloqué. La preuve
   * nomme le mandat et son signataire — jamais Laura (`actor_kind: 'system'`,
   * un modèle ne peut pas atteindre `approved`).
   */
  async approveUnderMandate(
    message: OutreachMessageEntity,
    mandate: { id: string; signer: string; scope: DelegationScope },
    stops: StopLookup,
    now: Date = new Date(),
  ): Promise<{ ok: true } | { ok: false; reason: string }> {
    const workspaceId = message.workspace_id
    if (!workspaceId) return { ok: false, reason: 'no_workspace' }
    // Lecture seule des contextes (bloquants) : le rôle n'y décide rien.
    const ctx: OutreachCtx = { userId: message.user_id, workspaceId, role: 'member' }
    const contacts = await this.contactsById(ctx, [message])
    const accounts = await this.accountsByContact(contacts.values())
    const contexts = await this.contextsFor(ctx, [message], contacts, accounts)
    const body =
      (await this.versions.findOne({ where: { message_id: message.id, version: message.current_version } }))?.body ?? ''
    const contact = contacts.get(message.contact_id) ?? null
    const account = contact?.account_id ? (accounts.get(contact.account_id) ?? null) : null
    const blockers = blockersOf(
      message,
      contact,
      account,
      body,
      await stops([message.contact_id]),
      contexts.get(message.id),
    )
    if (blockers.length > 0) return { ok: false, reason: `blocked:${blockers[0]}` }

    for (const to of message.status === 'drafted' ? (['needs_review', 'approved'] as const) : (['approved'] as const)) {
      const check = checkOutreachTransition('message', message.status, to, 'system')
      if (!check.ok) return { ok: false, reason: check.reason }
      const from = message.status
      message.status = to
      await this.logSystem(workspaceId, message, from, to, `mandate:${mandate.scope}`, { delegation_id: mandate.id })
    }
    message.approval = {
      author: mandate.signer,
      date: now.toISOString(),
      version: message.current_version,
      audience: { kind: 'contact', contact_ids: [message.contact_id], size: 1 },
      policy: OUTREACH_EDIT_POLICY,
      cost: null,
      conditions: [
        'no_blocker',
        `displayed_version:${message.current_version}`,
        `mandate_scope:${mandate.scope}`,
        `delegation:${mandate.id}`,
      ],
    }
    await this.messages.save(message)
    return { ok: true }
  }

  /** #3702.9 — les messages d'un mandat, pour l'écran (statut réel par étape). */
  async findByIds(workspaceId: string, ids: readonly string[]): Promise<OutreachMessageEntity[]> {
    if (ids.length === 0) return []
    return this.messages.find({ where: { id: In([...ids]), workspace_id: workspaceId } })
  }

  /** #3702.3 — un contact a-t-il répondu ? (message `replied` ou séquence de la campagne arrêtée). */
  async repliedAmong(workspaceId: string, contactIds: readonly string[], campaignLabel: string): Promise<Set<string>> {
    if (contactIds.length === 0) return new Set()
    const replied = await this.messages.find({
      where: { workspace_id: workspaceId, contact_id: In([...contactIds]), status: 'replied' },
      select: ['contact_id'],
    })
    const cancelled = await this.sequences.find({
      where: {
        workspace_id: workspaceId,
        contact_id: In([...contactIds]),
        campaign_label: campaignLabel,
        status: 'cancelled',
      },
      select: ['contact_id'],
    })
    return new Set([...replied, ...cancelled].map(row => row.contact_id))
  }

  /**
   * Une transition SYSTÈME, sans `ctx` HTTP — le dispatcher n'agit pour le
   * compte d'aucun utilisateur connecté, `actor` reste `null` (même convention
   * que `actor_kind: 'model'` dans {@link log}, étendue à `'system'` : aucune
   * des deux n'est un geste d'écran).
   */
  private async logSystem(
    workspaceId: string,
    message: OutreachMessageEntity,
    from: string,
    to: string,
    cause: string,
    proof: Record<string, unknown> | null,
  ): Promise<void> {
    await this.transitions.save(
      this.transitions.create({
        workspace_id: workspaceId,
        user_id: message.user_id,
        subject_kind: 'message',
        subject_id: message.id,
        from_state: from,
        to_state: to,
        actor: null,
        actor_kind: 'system',
        cause,
        proof,
        tool: 'outreach.dispatcher',
        permission: 'messages:send',
        result: 'applied',
        error: null,
      }),
    )
  }

  /**
   * Une transition humaine ou système sur un message, validée par la machine.
   * `approved` ne passe PAS par ici : une validation laisse une preuve, elle a
   * sa propre route (`approveMany`).
   */
  async transition(
    ctx: OutreachCtx,
    id: string,
    dto: TransitionOutreachRequest,
    actorKind: OutreachActorKind = 'user',
  ): Promise<OutreachMessage> {
    const message = await this.owned(ctx, id)
    if (dto.to === 'approved' && actorKind !== 'model') {
      throw new ConflictException('Une validation passe par la route d’approbation, qui en garde la preuve.')
    }
    this.assertCanEdit(ctx, message)
    await this.move(ctx, message, dto.to as OutreachMessageStatus, actorKind, dto.cause, dto.proof, {
      tool: 'outreach.messages.transition',
    })
    await this.messages.save(message)
    return this.toDto(ctx, message, new Set())
  }

  /** #2366.8 — l'historique des transitions d'un message ou d'un appel. */
  async history(ctx: OutreachCtx, kind: 'message' | 'call_task', id: string): Promise<OutreachTransition[]> {
    if (kind === 'message') await this.owned(ctx, id)
    else await this.ownedCall(ctx, id)
    const rows = await this.transitions.find({
      where: { subject_kind: kind, subject_id: id, ...workspaceScopeWhere(ctx.workspaceId) },
      order: { occurred_at: 'ASC' },
    })
    return rows.map(r => ({
      id: r.id,
      subject_kind: r.subject_kind,
      subject_id: r.subject_id,
      from_state: r.from_state,
      to_state: r.to_state,
      occurred_at: r.occurred_at.toISOString(),
      actor: r.actor,
      actor_kind: r.actor_kind,
      cause: r.cause,
      proof: r.proof,
      tool: r.tool,
      permission: r.permission,
      result: r.result,
      error: r.error,
    }))
  }

  /* ------------------------------ appels --------------------------------- */

  /**
   * #2380.59 — GA-122 : ce chemin ATTEIGNAIT une personne (proposer un appel)
   * sans consulter AUCUNE porte, absent du registre `send-paths-consult-the-
   * stop.spec.ts`. Un `do_not_call` posé par `ContactStopService` ne bloquait
   * donc que l'armement d'une séquence (`OutreachService.create`), jamais la
   * tâche d'appel. Même porte PERSONNE que le reste de ce service
   * (`stops`, fournie par le contrôleur — GA-07, ce service n'injecte pas
   * `ContactStopService` lui-même).
   */
  async createCallTask(
    ctx: OutreachCtx,
    dto: CreateOutreachCallTaskRequest,
    stops: StopLookup,
  ): Promise<OutreachCallTask> {
    const contact = await this.contacts.findOne({
      where: { id: dto.contact_id, ...workspaceScopeWhere(ctx.workspaceId) },
    })
    if (!contact) throw new NotFoundException('Contact introuvable dans cet espace.')
    const stopped = await stops([contact.id])
    if (stopped.has(contact.id)) {
      throw new ForbiddenException('Ce contact a demandé à ne plus être contacté : aucun appel ne peut être proposé.')
    }
    const call = await this.calls.save(
      this.calls.create({
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        contact_id: contact.id,
        source: dto.source,
        reason: dto.reason,
        objective: dto.objective,
        pitch: dto.pitch ?? null,
        expected_outcome: dto.expected_outcome ?? null,
        status: 'proposed',
        scheduled_at: dto.scheduled_at ? new Date(dto.scheduled_at) : null,
      }),
    )
    await this.log(ctx, 'call_task', call.id, null, 'proposed', 'user', 'created', { tool: 'outreach.calls.create' })
    return toCallDto(call, contact.full_name ?? null)
  }

  async listCallTasks(ctx: OutreachCtx): Promise<OutreachCallTask[]> {
    const rows = await this.calls.find({ where: workspaceScopeWhere(ctx.workspaceId), order: { created_at: 'DESC' } })
    const contacts = await this.contactsById(ctx, rows)
    return rows.map(r => toCallDto(r, contacts.get(r.contact_id)?.full_name ?? null))
  }

  async transitionCallTask(ctx: OutreachCtx, id: string, dto: TransitionOutreachRequest): Promise<OutreachCallTask> {
    const call = await this.ownedCall(ctx, id)
    if (call.user_id !== ctx.userId && !hasPermission(ctx.role, 'team:manage')) {
      throw new ForbiddenException('Cet appel appartient à un autre membre.')
    }
    const check = checkOutreachTransition('call_task', call.status, dto.to, 'user', dto.proof)
    if (!check.ok) {
      await this.log(ctx, 'call_task', call.id, call.status, dto.to, 'user', dto.cause, {
        tool: 'outreach.calls.transition',
        proof: dto.proof,
        refused: check.reason,
      })
      throw new ConflictException(`Transition refusée : ${call.status} → ${dto.to} (${check.reason}).`)
    }
    const from = call.status
    call.status = dto.to as OutreachCallTask['status']
    await this.calls.save(call)
    await this.log(ctx, 'call_task', call.id, from, call.status, 'user', dto.cause, {
      tool: 'outreach.calls.transition',
      proof: dto.proof,
    })
    const contact = await this.contacts.findOne({ where: { id: call.contact_id } })
    return toCallDto(call, contact?.full_name ?? null)
  }

  /**
   * Lot L-A (#4164) — « Reporter » un appel depuis la file Aujourd'hui.
   *
   * La tâche d'appel portait une échéance (`scheduled_at`) qu'aucune route ne
   * savait changer ; reporter n'est PAS une transition de la machine (l'appel
   * reste dans le même état), donc pas de `checkOutreachTransition` — mais un
   * appel déjà clos ne se reporte pas. Même appartenance que `transitionCallTask`
   * (espace + porteur, ou droit d'équipe).
   */
  async postponeCallTask(ctx: OutreachCtx, id: string, scheduledAt: string): Promise<OutreachCallTask> {
    const call = await this.ownedCall(ctx, id)
    if (call.user_id !== ctx.userId && !hasPermission(ctx.role, 'team:manage')) {
      throw new ForbiddenException('Cet appel appartient à un autre membre.')
    }
    if (CLOSED_CALL_STATUSES.includes(call.status)) {
      throw new ConflictException(`Un appel « ${call.status} » est clos : son échéance ne se reporte pas.`)
    }
    const from = call.scheduled_at ? call.scheduled_at.toISOString() : null
    call.scheduled_at = new Date(scheduledAt)
    await this.calls.save(call)
    await this.log(ctx, 'call_task', call.id, call.status, call.status, 'user', 'Échéance reportée', {
      tool: 'outreach.calls.postpone',
      proof: { from, to: call.scheduled_at.toISOString() },
    })
    const contact = await this.contacts.findOne({ where: { id: call.contact_id } })
    return toCallDto(call, contact?.full_name ?? null)
  }

  /**
   * #2369.12 (reste, épopée #2768) — relie le style comparé (#2369.11) au
   * message qui naît : un identifiant fourni est vérifié (appartenance à
   * l'espace, statut `active`) plutôt que d'écrire une valeur non vérifiable
   * (« un contrat d'API non vérifiable ne se devine pas »). `null`/absent =
   * comportement historique inchangé, aucun style relié.
   */
  private async resolveAppliedStyle(
    ctx: OutreachCtx,
    templateId: string | null,
  ): Promise<{ id: string; version: number } | null> {
    if (!templateId) return null
    const template = await this.styleTemplates.findOne({
      where: { id: templateId, ...workspaceScopeWhere(ctx.workspaceId) },
    })
    if (!template) throw new NotFoundException('Style de message introuvable dans cet espace.')
    if (template.status !== 'active') {
      throw new ConflictException('Ce style n’est pas actif — seul un style `active` peut être relié à un message.')
    }
    return { id: template.id, version: template.version }
  }

  /**
   * #2877 (#2385.4) — un signal qualité DÉCLARÉ par le relecteur (faux fait,
   * CTA incorrect, persona incorrect). Le système ne lit JAMAIS le corps pour
   * le deviner (doctrine) : c'est un geste humain, consigné tel quel. Un même
   * relecteur qui re-déclare la même nature n'ajoute rien (idempotent). Ne
   * change ni l'état ni le texte du message — un signal n'est pas une décision.
   */
  async flagQuality(
    ctx: OutreachCtx,
    id: string,
    kind: OutreachQualityFlagKind,
  ): Promise<{ kind: OutreachQualityFlagKind }> {
    const message = await this.owned(ctx, id)
    await this.qualityFlags
      .createQueryBuilder()
      .insert()
      .values({ workspace_id: ctx.workspaceId, message_id: message.id, flagged_by: ctx.userId, kind })
      .orIgnore()
      .execute()
    return { kind }
  }

  /**
   * #2385.4 — ce que LE LECTEUR a déjà déclaré, par message : la carte le
   * relit après coup (le toast seul s'évanouit). Ses déclarations seulement,
   * jamais celles d'un collègue ; un message sans déclaration n'a pas
   * d'entrée.
   */
  async ownQualityFlags(
    ctx: OutreachCtx,
    messageIds: readonly string[],
  ): Promise<Map<string, OutreachQualityFlagKind[]>> {
    const out = new Map<string, OutreachQualityFlagKind[]>()
    if (messageIds.length === 0) return out
    const rows = await this.qualityFlags.find({
      where: { workspace_id: ctx.workspaceId, flagged_by: ctx.userId, message_id: In([...messageIds]) },
      order: { created_at: 'ASC' },
    })
    for (const row of rows) out.set(row.message_id, [...(out.get(row.message_id) ?? []), row.kind])
    return out
  }

  /* ------------------------------- interne -------------------------------- */

  private async owned(ctx: OutreachCtx, id: string): Promise<OutreachMessageEntity> {
    const message = await this.messages.findOne({ where: { id, ...workspaceScopeWhere(ctx.workspaceId) } })
    if (!message) throw new NotFoundException('Message introuvable.')
    return message
  }

  /**
   * #2372.6 — LE GATE, à l'endroit réel où l'envoi/la préparation d'un message
   * joint un asset. `outreachAssetGate` (contrat pur, `outreach-asset.ts`)
   * décide ; ce service apporte le seul fait qu'il faut mesurer : ce contact
   * a-t-il déjà confirmé un intérêt (une réponse positive, #2381.6) ? Refusé
   * AVANT toute écriture — un asset dont la condition n'est pas remplie ne
   * laisse aucun message à moitié préparé.
   */
  private async assertAssetJoinable(ctx: OutreachCtx, assetId: string, contactId: string): Promise<void> {
    const asset = await this.assets.findOne({ where: { id: assetId, ...workspaceScopeWhere(ctx.workspaceId) } })
    if (!asset) throw new NotFoundException('Asset introuvable dans cet espace.')
    const interestConfirmed = await this.confirmedInterest(ctx, contactId)
    const gate = outreachAssetGate(asset.usage_rights, interestConfirmed)
    if (!gate.ok) {
      throw new ConflictException(
        `Asset non joignable : cet asset ne s'envoie qu'après un intérêt confirmé (${gate.reason}).`,
      )
    }
  }

  /**
   * Un intérêt est confirmé quand ce contact a déjà reçu l'effet `reply_positive`
   * (#2381.6, `outreachReplyEffect`) sur l'une de ses séquences — la MÊME preuve
   * déterministe que `MailboxService.stopSequencesForContact` écrit dans
   * `outreach_transitions` (`subject_kind: 'sequence'`), jamais un second calcul.
   */
  private async confirmedInterest(ctx: OutreachCtx, contactId: string): Promise<boolean> {
    const contactSequences = await this.sequences.find({
      where: { contact_id: contactId, ...workspaceScopeWhere(ctx.workspaceId) },
      select: ['id'],
    })
    if (contactSequences.length === 0) return false
    const sequenceIds = contactSequences.map(s => s.id)
    const positiveReply = await this.transitions.findOne({
      where: {
        subject_kind: 'sequence',
        subject_id: In(sequenceIds),
        cause: 'reply_positive',
        result: 'applied',
      },
    })
    return positiveReply !== null
  }

  private async ownedCall(ctx: OutreachCtx, id: string): Promise<OutreachCallTaskEntity> {
    const call = await this.calls.findOne({ where: { id, ...workspaceScopeWhere(ctx.workspaceId) } })
    if (!call) throw new NotFoundException('Appel introuvable.')
    return call
  }

  /**
   * #2382.7 — la délégation, en règle STATIQUE (reco du registre tranchée le
   * 22/09 soir) : l'owner valide son propre message avec `messages:send` ;
   * valider celui d'un autre exige `team:manage` (manager, admin, owner). Les
   * seuils « selon volume et risque » ne sont pas inventés.
   */
  private requiredPermission(ctx: OutreachCtx, message: OutreachMessageEntity): WorkspacePermission {
    return message.user_id === ctx.userId ? 'messages:send' : 'team:manage'
  }

  private canApprove(ctx: OutreachCtx, message: OutreachMessageEntity): boolean {
    return hasPermission(ctx.role, this.requiredPermission(ctx, message))
  }

  private assertCanEdit(ctx: OutreachCtx, message: OutreachMessageEntity): void {
    if (!this.canApprove(ctx, message)) {
      throw new ForbiddenException(
        'Ce message appartient à un autre membre : sa modification demande la gestion d’équipe.',
      )
    }
  }

  /** Applique une transition de message si la machine l'accepte ; trace l'acceptation ET le refus. */
  private async move(
    ctx: OutreachCtx,
    message: OutreachMessageEntity,
    to: OutreachMessageStatus,
    actorKind: OutreachActorKind,
    cause: string,
    proof: Record<string, unknown> | null,
    meta: { tool: string; permission?: string },
  ): Promise<void> {
    const check = checkOutreachTransition('message', message.status, to, actorKind, proof)
    if (!check.ok) {
      await this.log(ctx, 'message', message.id, message.status, to, actorKind, cause, {
        ...meta,
        proof,
        refused: check.reason,
      })
      if (check.reason === 'model_forbidden') {
        throw new ForbiddenException('Laura prépare, un humain valide : cette transition attend votre geste.')
      }
      throw new ConflictException(`Transition refusée : ${message.status} → ${to} (${check.reason}).`)
    }
    const from = message.status
    message.status = to
    await this.log(ctx, 'message', message.id, from, to, actorKind, cause, { ...meta, proof })
  }

  private async log(
    ctx: OutreachCtx,
    kind: 'message' | 'call_task',
    subjectId: string,
    from: string | null,
    to: string,
    actorKind: OutreachActorKind,
    cause: string,
    meta: { tool: string; permission?: string; proof?: Record<string, unknown> | null; refused?: string },
  ): Promise<void> {
    await this.transitions.save(
      this.transitions.create({
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        subject_kind: kind,
        subject_id: subjectId,
        from_state: from,
        to_state: to,
        actor: actorKind === 'model' ? null : ctx.userId,
        actor_kind: actorKind,
        cause,
        proof: meta.proof ?? null,
        tool: meta.tool,
        permission: meta.permission ?? 'messages:send',
        result: meta.refused ? 'refused' : 'applied',
        error: meta.refused ?? null,
      }),
    )
  }

  private async saveVersion(
    ctx: OutreachCtx,
    messageId: string,
    version: number,
    kind: OutreachMessageVersionEntity['kind'],
    subject: string | null,
    body: string,
    author: string | null,
  ): Promise<void> {
    await this.versions.save(
      this.versions.create({
        workspace_id: ctx.workspaceId,
        user_id: ctx.userId,
        message_id: messageId,
        version,
        kind,
        subject,
        body,
        author,
      }),
    )
  }

  private async contactsById(
    ctx: OutreachCtx,
    rows: ReadonlyArray<{ contact_id: string }>,
  ): Promise<Map<string, ContactEntity>> {
    const ids = [...new Set(rows.map(r => r.contact_id))]
    if (ids.length === 0) return new Map()
    const contacts = await this.contacts.find({ where: { id: In(ids), ...workspaceScopeWhere(ctx.workspaceId) } })
    return new Map(contacts.map(c => [c.id, c]))
  }

  /**
   * #3419/#3420 (30/09, lot C16) — le compte de chaque contact, pour le test
   * de généricité (`outreachContentBlockers`) ; même lot d'IDs, une seule
   * lecture, partagée par `toDtos` ET `approveMany` (GA-26).
   */
  private async accountsByContact(contacts: Iterable<ContactEntity>): Promise<Map<string, AccountEntity>> {
    const accountIds = [...new Set([...contacts].map(c => c.account_id).filter((id): id is string => !!id))]
    if (accountIds.length === 0) return new Map()
    return new Map((await this.accounts.find({ where: { id: In(accountIds) } })).map(a => [a.id, a]))
  }

  /**
   * #3420 (lot Q06) — ce que le serveur sait AUTOUR de chaque message pour juger
   * les critères de contexte : messages déjà partis vers le contact, autres
   * messages de la même séquence (et le rang de celui-ci), ce qu'on sait du
   * compte. Trois lectures en lot pour tout l'écran, partagées par `toDtos` ET
   * `approveMany` (GA-26) — jamais une lecture par message.
   */
  private async contextsFor(
    ctx: OutreachCtx,
    rows: readonly OutreachMessageEntity[],
    contacts: ReadonlyMap<string, ContactEntity>,
    accounts: ReadonlyMap<string, AccountEntity>,
  ): Promise<Map<string, MessageContext>> {
    const out = new Map<string, MessageContext>()
    if (rows.length === 0) return out

    const contactIds = [...new Set(rows.map(r => r.contact_id))]
    const gone = await this.messages.find({
      where: { contact_id: In(contactIds), status: In([...SENT_STATUSES]), ...workspaceScopeWhere(ctx.workspaceId) },
    })
    const goneByContact = new Map<string, string[]>()
    for (const m of gone) goneByContact.set(m.contact_id, [...(goneByContact.get(m.contact_id) ?? []), m.id])

    const sequenceIds = [...new Set(rows.map(r => r.sequence_id).filter((id): id is string => !!id))]
    const inSequences =
      sequenceIds.length === 0
        ? []
        : await this.messages.find({
            where: { sequence_id: In(sequenceIds), ...workspaceScopeWhere(ctx.workspaceId) },
          })
    const siblingVersions =
      inSequences.length === 0
        ? []
        : await this.versions.find({ where: { message_id: In(inSequences.map(m => m.id)) } })
    const bodyOf = (m: OutreachMessageEntity): string =>
      siblingVersions.find(v => v.message_id === m.id && v.version === m.current_version)?.body ?? ''

    for (const message of rows) {
      const contact = contacts.get(message.contact_id) ?? null
      const account = contact?.account_id ? (accounts.get(contact.account_id) ?? null) : null
      const inSequence = message.sequence_id
        ? inSequences
            .filter(m => m.sequence_id === message.sequence_id)
            .sort((a, b) => a.created_at.getTime() - b.created_at.getTime() || a.id.localeCompare(b.id))
        : []
      const position = inSequence.findIndex(m => m.id === message.id)
      out.set(message.id, {
        priorContactedCount: (goneByContact.get(message.contact_id) ?? []).filter(id => id !== message.id).length,
        siblingBodies: inSequence.filter(m => m.id !== message.id).map(bodyOf),
        sequencePosition: message.sequence_id && position >= 0 ? position : null,
        accountAnchors: accountAnchorsOf(account, message.reason),
        verifiedTechStack: verifiedTechStackOf(account),
      })
    }
    return out
  }

  private async toDto(
    ctx: OutreachCtx,
    message: OutreachMessageEntity,
    stopped: ReadonlySet<string>,
  ): Promise<OutreachMessage> {
    const [dto] = await this.toDtos(ctx, [message], stopped)
    return dto as OutreachMessage
  }

  private async toDtos(
    ctx: OutreachCtx,
    rows: OutreachMessageEntity[],
    stopped: ReadonlySet<string>,
  ): Promise<OutreachMessage[]> {
    const contacts = await this.contactsById(ctx, rows)
    const accounts = await this.accountsByContact(contacts.values())
    const contexts = await this.contextsFor(ctx, rows, contacts, accounts)
    const versions = await this.versions.find({
      where: { message_id: In(rows.map(r => r.id)) },
      order: { version: 'ASC' },
    })

    const myFlags = await this.ownQualityFlags(
      ctx,
      rows.map(r => r.id),
    )

    return rows.map(message => {
      const own = versions.filter(v => v.message_id === message.id).sort((a, b) => a.version - b.version)
      const current = own.find(v => v.version === message.current_version) ?? own.at(-1)
      const contact = contacts.get(message.contact_id) ?? null
      const account = contact?.account_id ? (accounts.get(contact.account_id) ?? null) : null
      const body = current?.body ?? ''
      const blockers = blockersOf(message, contact, account, body, stopped, contexts.get(message.id))
      const edited = own.some(v => v.kind === 'user_edit')
      const risks: OutreachRisk[] = []
      if (contact && isStale(contact, account)) risks.push('stale_contact')
      if (edited) risks.push('edited_by_user')
      return {
        id: message.id,
        contact_id: message.contact_id,
        contact_name: contact?.full_name ?? null,
        contact_role: contact?.title ?? null,
        account_name: account?.company_name ?? null,
        channel: message.channel,
        intent: message.intent,
        source: message.source,
        reason: message.reason,
        status: message.status,
        sequence_id: message.sequence_id,
        sequence_step_id: message.sequence_step_id,
        asset_id: message.outreach_asset_id,
        owner_id: message.user_id,
        current_version: message.current_version,
        message_style_template_id: message.message_style_template_id,
        message_style_template_version: message.message_style_template_version,
        subject: current?.subject ?? null,
        body,
        versions: own.map(v => ({
          version: v.version,
          kind: v.kind,
          subject: v.subject,
          body: v.body,
          author: v.author,
          created_at: v.created_at.toISOString(),
        })),
        approval: message.approval,
        view: outreachApprovalView({ status: message.status, blockers, edited_by_user: edited }),
        blockers,
        risks,
        can_approve: this.canApprove(ctx, message),
        my_quality_flags: myFlags.get(message.id),
        required_permission: this.requiredPermission(ctx, message),
        created_at: message.created_at.toISOString(),
        updated_at: message.updated_at.toISOString(),
      }
    })
  }
}

/**
 * Les règles bloquantes MESURÉES (#2382) — l'ordre est celui de la carte.
 * #3419/#3420 (30/09, lot C16) — `outreachContentBlockers` (contrat, pur) y
 * ajoute les cinq mesurées sur le seul texte ; `account` ne sert qu'à ça, un
 * message sans compte lié (aucun `account_id` sur le contact) garde le test
 * de généricité limité au nom du contact.
 */
function blockersOf(
  message: OutreachMessageEntity,
  contact: ContactEntity | null,
  account: AccountEntity | null,
  body: string,
  stopped: ReadonlySet<string>,
  context?: MessageContext,
): OutreachBlocker[] {
  const out: OutreachBlocker[] = []
  if (stopped.has(message.contact_id)) out.push('opted_out')
  const address =
    message.channel === 'email'
      ? contact?.email
      : message.channel === 'linkedin'
        ? contact?.linkedin_url
        : message.channel === 'phone'
          ? contact?.phone
          : 'manual'
  if (!address) out.push('missing_channel_address')
  if (body.trim().length === 0) out.push('empty_message')
  // #3420 (recette prod 02/10) — un message VALIDÉ a passé le contrôle qualité :
  // lui afficher « Le message ne cite rien… » à côté de « Validé » est une
  // contradiction. Seuls les bloquants de LIVRAISON (opt-out, adresse, vide) se
  // relisent encore sur lui ; toute modification le repasse en relecture.
  if (QUALITY_CLEARED_STATUSES.includes(message.status)) return out
  out.push(
    ...outreachContentBlockers({
      body,
      accountName: account?.company_name ?? null,
      contactName: contact?.full_name ?? null,
    }),
  )
  // #3420 (lot Q06) — les critères de CONTEXTE. Sans contexte lu (appelant qui
  // ne l'a pas chargé), ils ne jugent pas : non évaluables, jamais devinés.
  if (context && JUDGED_STATUSES.includes(message.status)) {
    out.push(
      ...outreachContextBlockers({
        body,
        channel: message.channel,
        intent: message.intent,
        contactName: contact?.full_name ?? null,
        contactStatus: contact?.user_status ?? null,
        ...context,
      }),
    )
  }
  return out
}

type MessageContext = Pick<
  OutreachContextInput,
  'priorContactedCount' | 'siblingBodies' | 'sequencePosition' | 'accountAnchors' | 'verifiedTechStack'
>

/** Les états où le contrôle qualité est déjà PASSÉ : aucun motif de qualité ne s'y affiche. */
const QUALITY_CLEARED_STATUSES: readonly OutreachMessageEntity['status'][] = ['approved', 'scheduled']

/** Les états où le message attend encore un jugement : un message déjà parti n'est plus jugé. */
const JUDGED_STATUSES: readonly OutreachMessageEntity['status'][] = ['drafted', 'needs_review', 'approved', 'scheduled']

/** Les états d'un message qui est RÉELLEMENT parti (ou copié pour envoi manuel). */
const SENT_STATUSES = ['sending', 'sent', 'delivered', 'replied', 'copied_manual'] as const

/**
 * #3420.3 — ce qu'on sait du compte, en textes : son secteur, ses signaux
 * récents (titre ou résumé) et la raison de la prise de contact. `[]` = rien
 * de connu → le critère de périmètre n'est pas évaluable.
 */
function accountAnchorsOf(account: AccountEntity | null, reason: string | null): string[] {
  const anchors: string[] = []
  if (reason?.trim()) anchors.push(reason)
  if (account?.sector?.trim()) anchors.push(account.sector)
  // Louis 23/10 — les signaux se lisent par le lecteur UNIQUE (`readRecentSignals`, GA-26) : la collecte écrit le
  // libellé sous `signal`, une clé que la lecture des ancres ne regardait pas — un message qui citait le
  // communiqué du compte était jugé « ne cite rien ».
  for (const signal of readRecentSignals(account?.recent_signals ?? [])) {
    anchors.push(signal.label)
    if (signal.sales_implication?.trim()) anchors.push(signal.sales_implication)
  }
  return anchors
}

/**
 * #3419.2 — les technologies CONFIRMÉES du compte : la stack détectée et la
 * stack déclarée de l'analyse (`raw_analysis`). `[]` = rien de confirmé.
 */
function verifiedTechStackOf(account: AccountEntity | null): string[] {
  const raw = (account?.raw_analysis ?? {}) as { detected_tech_stack?: unknown; technology_stack?: unknown }
  const names: string[] = []
  if (Array.isArray(raw.detected_tech_stack)) {
    for (const item of raw.detected_tech_stack) if (typeof item === 'string' && item.trim()) names.push(item)
  }
  if (Array.isArray(raw.technology_stack)) {
    for (const item of raw.technology_stack) {
      const name = (item as { name?: unknown } | null)?.name
      if (typeof name === 'string' && name.trim()) names.push(name)
    }
  }
  return names
}

/** Même calcul que le badge RISQUE et que la garde des séquences — jamais une seconde lecture. */
function isStale(contact: ContactEntity, account: AccountEntity | null): boolean {
  if (!account?.company_name) return false
  const apolloDetails = ((contact.raw_data ?? {}) as { apolloDetails?: ContactApolloDetails }).apolloDetails ?? null
  return (
    contactSourceTag(contact.source ?? null, apolloDetails, account.company_name, contact.entity ?? null) === 'RISQUE'
  )
}

function toCallDto(call: OutreachCallTaskEntity, contactName: string | null): OutreachCallTask {
  return {
    id: call.id,
    contact_id: call.contact_id,
    contact_name: contactName,
    reason: call.reason,
    objective: call.objective,
    pitch: call.pitch,
    expected_outcome: call.expected_outcome,
    status: call.status,
    source: call.source,
    scheduled_at: call.scheduled_at ? call.scheduled_at.toISOString() : null,
    created_at: call.created_at.toISOString(),
    // #2395 — le porteur, lu par l'objet Action canonique (owner, portée « mes actions »).
    user_id: call.user_id,
  }
}
