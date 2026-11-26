import { createHash, randomUUID } from 'node:crypto'
import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, type Repository } from 'typeorm'
import {
  delegationLifecycle,
  delegationVerdict,
  exceedsPlanBounds,
  sendBoundsOfPlan,
  type CreateOutreachDelegationRequest,
  type CreateOutreachMessageRequest,
  type CreateScopedDelegationRequest,
  type RenewDelegationRequest,
  type WorkspaceDelegationScope,
  type DelegationVerdict,
  type OutreachDelegation,
  type OutreachDelegationView,
} from '@bellum/contracts'
import { ContactEntity } from '../../database/entities/contact.entity'
import { ContactStopEntity } from '../../database/entities/contact-stop.entity'
import { OutreachDelegationEntity } from '../../database/entities/outreach-delegation.entity'
import type { OutreachMessageEntity } from '../../database/entities/outreach-message.entity'
import { OutreachSequenceEntity } from '../../database/entities/outreach-sequence.entity'
import { OutreachSequenceStepEntity } from '../../database/entities/outreach-sequence-step.entity'
import type { MailboxStatus } from '@bellum/contracts'
import { OutreachMessageService, type OutreachCtx, type StopLookup } from './outreach-message.service'

/** `delegation:<uuid>` dans `approval.conditions` : ce qui fait passer un message par le mandat. */
const DELEGATION_CONDITION = /^delegation:([0-9a-f-]{36})$/

export function delegationIdOf(message: Pick<OutreachMessageEntity, 'approval'>): string | null {
  for (const condition of message.approval?.conditions ?? []) {
    const match = DELEGATION_CONDITION.exec(condition)
    if (match?.[1]) return match[1]
  }
  return null
}

/** L'empreinte des contenus relus : change dès qu'une version relue change (#3702.5). */
export function reviewedContentHash(items: readonly { id: string; version: number }[]): string {
  const canonical = [...items]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(item => `${item.id}:${item.version}`)
    .join('|')
  return createHash('sha256').update(canonical).digest('hex')
}

export type StepGate =
  | { kind: 'individual' } // pas de mandat : c81 inchangée, le dispatcher n'a rien de plus à décider
  | { kind: 'run'; delegationId: string }
  | { kind: 'hold'; reason: string }
  | { kind: 'stop'; reason: string }

/**
 * #3702 — LE MANDAT D'ENVOI (c89). Crée, suspend, révoque ; et DÉCIDE pour le
 * dispatcher via `delegationVerdict` (contrat pur). N'envoie jamais.
 */
@Injectable()
export class OutreachDelegationService {
  constructor(
    @InjectRepository(OutreachDelegationEntity)
    private readonly delegations: Repository<OutreachDelegationEntity>,
    private readonly messages: OutreachMessageService,
    // « Ne me contactez plus » : lu sur l'entité (GA-07 — pas de service de plus), même table que `ContactStopService`.
    @InjectRepository(ContactStopEntity)
    private readonly contactStops: Repository<ContactStopEntity>,
    // Contact ÉCARTÉ (`excluded_at`, PDF 2, items 82-83) : même fait que celui déjà lu par
    // `CampaignAudienceService` (`opted_out = stopped || excluded_at`), ici réévalué à l'ENVOI
    // (#3702.9) — un compte écarté ou un effacement RGPD après la création du mandat arrête la suite.
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    // #4016 L5 (reprise 20/10) — APPENDÉS EN FIN (les specs construisent ce service par position) et
    // optionnels : la portée `workspace_sequences` relit la séquence et l'étape À CHAQUE ENVOI. Sans
    // elles, un message de séquence n'est jamais couvert (inconnu ⇒ attend, il reste en relecture).
    @Optional()
    @InjectRepository(OutreachSequenceEntity)
    private readonly sequences?: Repository<OutreachSequenceEntity>,
    @Optional()
    @InjectRepository(OutreachSequenceStepEntity)
    private readonly sequenceSteps?: Repository<OutreachSequenceStepEntity>,
  ) {}

  /**
   * Valider un mandat = valider les messages relus (preuve humaine par message,
   * `approveMany`) puis les rattacher au mandat. Exclu ≠ silencieux : si rien
   * n'est validable, on refuse ; sinon on rend ce qui a été exclu.
   */
  async create(
    ctx: OutreachCtx,
    dto: CreateOutreachDelegationRequest,
    stops: StopLookup,
    status: MailboxStatus,
    now: Date = new Date(),
  ): Promise<{ delegation: OutreachDelegationView; excluded: { id: string; reason: string }[] }> {
    if (!ctx.workspaceId) throw new BadRequestException('Espace actif requis pour déléguer.')
    this.assertMailbox(status, dto.sender_mailbox_id)
    const rows = await this.messages.findByIds(
      ctx.workspaceId,
      dto.messages.map(m => m.id),
    )
    const inScope = new Set(dto.contact_ids)
    const eligible = dto.messages.filter(item => {
      const row = rows.find(r => r.id === item.id)
      return row && inScope.has(row.contact_id) && row.channel === 'email'
    })
    const excluded: { id: string; reason: string }[] = dto.messages
      .filter(item => !eligible.includes(item))
      .map(item => ({ id: item.id, reason: 'out_of_scope' }))

    // Chaque message est validé individuellement (preuve + version vue) AVANT d'être couvert.
    const pending = rows.filter(r => eligible.some(e => e.id === r.id) && r.status !== 'approved')
    if (pending.length > 0) {
      const result = await this.messages.approveMany(
        ctx,
        {
          items: pending.map(r => ({
            id: r.id,
            version: eligible.find(e => e.id === r.id)?.version ?? r.current_version,
          })),
        },
        stops,
      )
      for (const item of result.excluded) excluded.push({ id: item.id, reason: item.reason })
    }
    const delegationId = randomUUID()
    const tagged = await this.messages.tagDelegation(ctx.workspaceId, delegationId, eligible)
    if (tagged.length === 0) {
      throw new BadRequestException({
        code: 'nothing_to_delegate',
        message: 'Aucun message relu ne peut être délégué.',
      })
    }
    for (const item of eligible) if (!tagged.includes(item.id)) excluded.push({ id: item.id, reason: 'not_covered' })

    const covered = eligible.filter(item => tagged.includes(item.id))
    const coveredContacts = [...new Set(rows.filter(r => tagged.includes(r.id)).map(r => r.contact_id))]
    const row = this.delegations.create({
      id: delegationId,
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      scope: 'campaign',
      renewed_from: null,
      campaign_label: dto.campaign_label,
      contact_ids: coveredContacts,
      channels: dto.channels,
      sender_mailbox_id: dto.sender_mailbox_id,
      messages: covered,
      content_hash: reviewedContentHash(covered),
      window_start_hour: dto.window.start_hour,
      window_end_hour: dto.window.end_hour,
      starts_at: now,
      expires_at: new Date(now.getTime() + dto.duration_days * 86_400_000),
      max_messages: Math.min(dto.max_messages, covered.length),
      sent_count: 0,
      validated_by: [ctx.userId],
      validated_at: now,
      revoked_at: null,
      paused_at: null,
    })
    await this.delegations.save(row)
    return { delegation: this.toView(row, now), excluded }
  }

  async list(ctx: OutreachCtx, now: Date = new Date()): Promise<OutreachDelegationView[]> {
    if (!ctx.workspaceId) return []
    const rows = await this.delegations.find({
      where: { workspace_id: ctx.workspaceId },
      order: { created_at: 'DESC' },
    })
    // #4737 — le mandat LinkedIn est la MÊME notion mais sa propre porte (`linkedin/mandate`) : l'écran e-mail ne le liste pas.
    return rows.filter(row => row.scope !== 'linkedin_send').map(row => this.toView(row, now))
  }

  async pause(ctx: OutreachCtx, id: string, now: Date = new Date()): Promise<OutreachDelegationView> {
    const row = await this.owned(ctx, id)
    if (!row.revoked_at && !row.paused_at) row.paused_at = now
    return this.toView(await this.delegations.save(row), now)
  }

  async resume(ctx: OutreachCtx, id: string, now: Date = new Date()): Promise<OutreachDelegationView> {
    const row = await this.owned(ctx, id)
    if (row.revoked_at) throw new BadRequestException({ code: 'revoked', message: 'Un mandat révoqué ne reprend pas.' })
    // #4293.2 (#3702.3) — la reprise ne re-signe rien, donc elle ne ressuscite pas un mandat expiré : il se renouvelle.
    if (now.getTime() >= row.expires_at.getTime()) {
      throw new BadRequestException({ code: 'expired', message: 'Un mandat expiré se renouvelle, il ne reprend pas.' })
    }
    row.paused_at = null
    return this.toView(await this.delegations.save(row), now)
  }

  /** Révoquer est définitif : un nouveau mandat se crée, il ne se « rouvre » pas. */
  async revoke(ctx: OutreachCtx, id: string, now: Date = new Date()): Promise<OutreachDelegationView> {
    const row = await this.owned(ctx, id)
    if (!row.revoked_at) row.revoked_at = now
    return this.toView(await this.delegations.save(row), now)
  }

  /**
   * #4016 L5 — SIGNER un mandat d'espace pour UNE portée (Laura, séquences,
   * relances d'impayé, suivi de rendez-vous). Geste explicite (`signed: true`,
   * vérifié par le schéma), boîte d'envoi connectée, bornes du PLAN respectées —
   * un dépassement est refusé et NOMMÉ, jamais écrêté en silence. Un seul mandat
   * actif par portée : en signer un second sans révoquer le premier est refusé.
   * Rien n'est rétroactif : `validated_at` est la borne sous laquelle aucun fait
   * antérieur ne part (`predates_mandate`).
   */
  async createScoped(
    ctx: OutreachCtx,
    dto: CreateScopedDelegationRequest,
    status: MailboxStatus,
    plan: string | null,
    now: Date = new Date(),
  ): Promise<OutreachDelegationView> {
    if (!ctx.workspaceId) throw new BadRequestException('Espace actif requis pour signer un mandat.')
    if (!dto.signed) throw new BadRequestException({ code: 'unsigned', message: 'Un mandat se signe explicitement.' })
    this.assertMailbox(status, dto.sender_mailbox_id)
    const exceeded = exceedsPlanBounds(dto, sendBoundsOfPlan(plan))
    if (exceeded) {
      throw new BadRequestException({
        code: `plan_bound_${exceeded}`,
        message: 'Ce mandat dépasse les bornes d’envoi de votre offre.',
      })
    }
    const live = await this.delegations.find({ where: { workspace_id: ctx.workspaceId, scope: dto.scope } })
    if (live.some(row => this.isLive(row, now))) {
      throw new BadRequestException({
        code: 'already_signed',
        message: 'Un mandat est déjà actif pour cet usage : révoquez-le ou renouvelez-le.',
      })
    }
    const row = this.delegations.create({
      id: randomUUID(),
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      scope: dto.scope,
      renewed_from: null,
      campaign_label: dto.campaign_label,
      contact_ids: dto.contact_ids,
      channels: dto.channels,
      sender_mailbox_id: dto.sender_mailbox_id,
      messages: [],
      content_hash: null,
      window_start_hour: dto.window.start_hour,
      window_end_hour: dto.window.end_hour,
      starts_at: now,
      expires_at: new Date(now.getTime() + dto.duration_days * 86_400_000),
      max_messages: dto.max_messages,
      sent_count: 0,
      validated_by: [ctx.userId],
      validated_at: now,
      revoked_at: null,
      paused_at: null,
    })
    return this.toView(await this.delegations.save(row), now)
  }

  /**
   * #4016 L5 (point 3) — RENOUVELER = un NOUVEAU mandat, re-signé par celui qui
   * renouvelle, mêmes bornes, nouvelle durée, compteur à zéro. L'ancien est
   * révoqué (remplacé), jamais prolongé en place : la signature d'origine ne
   * couvre que la période qu'elle a lue. Un mandat révoqué ne se renouvelle pas.
   * Une campagne garde ses contenus relus (mêmes messages, même empreinte).
   */
  async renew(
    ctx: OutreachCtx,
    id: string,
    dto: RenewDelegationRequest,
    plan: string | null,
    now: Date = new Date(),
  ): Promise<OutreachDelegationView> {
    if (!dto.signed) throw new BadRequestException({ code: 'unsigned', message: 'Un mandat se signe explicitement.' })
    const source = await this.owned(ctx, id)
    if (source.revoked_at) {
      throw new BadRequestException({ code: 'revoked', message: 'Un mandat révoqué ne se renouvelle pas.' })
    }
    const exceeded = exceedsPlanBounds(
      { duration_days: dto.duration_days, max_messages: source.max_messages, contact_ids: source.contact_ids },
      sendBoundsOfPlan(plan),
    )
    if (exceeded) {
      throw new BadRequestException({
        code: `plan_bound_${exceeded}`,
        message: 'Ce mandat dépasse les bornes d’envoi de votre offre.',
      })
    }
    const nextId = randomUUID()
    const next = this.delegations.create({
      ...source,
      id: nextId,
      user_id: ctx.userId,
      renewed_from: source.id,
      created_at: now,
      starts_at: now,
      expires_at: new Date(now.getTime() + dto.duration_days * 86_400_000),
      sent_count: 0,
      validated_by: [ctx.userId],
      validated_at: now,
      revoked_at: null,
      paused_at: null,
    })
    const saved = await this.delegations.save(next)
    if ((source.scope ?? 'campaign') === 'campaign' && source.messages.length > 0) {
      await this.messages.tagDelegation(source.workspace_id, nextId, source.messages)
    }
    source.revoked_at = now
    await this.delegations.save(source)
    return this.toView(saved, now)
  }

  /**
   * #4016 L5 — un USAGE (Laura, relance, suivi de rendez-vous, séquence) dépose
   * un message qui ATTEND le mandat de sa portée. Il naît en relecture comme
   * tout message préparé (`create`) ; rien ne part ici. C'est le dispatcher qui,
   * à l'heure de l'envoi, cherche un mandat actif et relit tous les faits.
   */
  async enqueueUnderMandate(
    ctx: OutreachCtx,
    scope: WorkspaceDelegationScope,
    dto: CreateOutreachMessageRequest,
    stops: StopLookup,
    originatedAt: Date,
    actorKind: 'user' | 'model' | 'system' = 'system',
  ): Promise<{ id: string; scope: WorkspaceDelegationScope }> {
    const message = await this.messages.create(ctx, dto, stops, actorKind)
    await this.messages.awaitMandate(ctx.workspaceId, message.id, scope, originatedAt)
    return { id: message.id, scope }
  }

  /**
   * #4016 L5 (reprise 20/10) — l'APPELANT d'un usage (Laura, séquences de
   * l'espace) vient de préparer un message : il le rattache à sa portée
   * SEULEMENT si un mandat de cette portée est signé et vivant. Sans mandat, le
   * brouillon reste ordinaire, en relecture (c81 inchangée) ; aucun fait
   * antérieur à une signature future ne serait couvert de toute façon (pas de
   * mandat rétroactif). Rien ne part ici : c'est le dispatcher qui relit tout.
   */
  async awaitIfMandated(
    workspaceId: string | null,
    messageId: string,
    scope: WorkspaceDelegationScope,
    originatedAt: Date,
    now: Date = new Date(),
  ): Promise<boolean> {
    if (!workspaceId) return false
    const rows = await this.delegations.find({ where: { workspace_id: workspaceId, scope } })
    if (!rows.some(row => this.isLive(row, now))) return false
    await this.messages.awaitMandate(workspaceId, messageId, scope, originatedAt)
    return true
  }

  /**
   * #4016 L5 — la porte du dispatcher pour un message qui ATTEND un mandat
   * (`mandate_scope`). Sans mandat de cette portée, ou un mandat qui ne couvre
   * pas : `hold`, le message reste en relecture (c81 inchangée). Un fait du
   * contact : `stop`. Sinon le quota est RÉSERVÉ et le message est validé SOUS
   * MANDAT (mêmes bloquants que le clic), puis le dispatcher l'envoie.
   */
  async gateAwaitingMandate(
    message: OutreachMessageEntity,
    caps: MailboxStatus,
    stops: StopLookup,
    now: Date = new Date(),
  ): Promise<StepGate> {
    const workspaceId = message.workspace_id
    const scope = message.mandate_scope
    if (!workspaceId || !scope) return { kind: 'hold', reason: 'no_delegation' }
    const rows = await this.delegations.find({
      where: { workspace_id: workspaceId, scope },
      order: { validated_at: 'DESC' },
    })
    const row = rows.find(candidate => !candidate.revoked_at) ?? null
    if (!row) return { kind: 'hold', reason: 'no_delegation' }
    // #4016 L5 (reprise 20/10) — un message de SÉQUENCE : la séquence et l'étape relues à CET envoi.
    // L'échéance VIVANTE de l'étape remplace celle du dépôt (une étape reportée attend `not_due`).
    let originatedAt: Date | undefined
    if (message.sequence_id || message.sequence_step_id) {
      const live = await this.liveSequenceStep(message)
      if (live.kind === 'over') return { kind: 'hold', reason: 'sequence_over' }
      if (live.kind === 'paused') return { kind: 'hold', reason: 'paused' }
      if (live.kind === 'manual_only') return { kind: 'hold', reason: 'manual_only' }
      originatedAt = live.dueAt
    }
    const verdict = await this.verdictFor(row, message, caps, now, originatedAt)
    if (verdict.decision === 'stop') return { kind: 'stop', reason: verdict.reason }
    if (verdict.decision === 'awaits_validation') return { kind: 'hold', reason: verdict.reason }
    const reserved = await this.reserve(row.id)
    if (!reserved) return { kind: 'hold', reason: 'quota_reached' }
    const approved = await this.messages.approveUnderMandate(
      message,
      { id: row.id, signer: row.validated_by[0] ?? row.user_id, scope },
      stops,
      now,
    )
    if (!approved.ok) {
      await this.release(row.id)
      return { kind: 'hold', reason: approved.reason }
    }
    return { kind: 'run', delegationId: row.id }
  }

  /**
   * La porte du dispatcher : que fait CE message `approved` ? Sans condition
   * `delegation:` ⇒ `individual` (c81 inchangée). Avec : verdict du contrat,
   * faits lus ici (boîte, lecture des réponses, réponse du contact, opposition).
   * `run` RÉSERVE un envoi du quota (UPDATE conditionnel — pas de double
   * exécution, deux passages ne dépassent jamais le plafond).
   */
  async gate(message: OutreachMessageEntity, caps: MailboxStatus, now: Date = new Date()): Promise<StepGate> {
    const delegationId = delegationIdOf(message)
    if (!delegationId) return { kind: 'individual' }
    const workspaceId = message.workspace_id
    if (!workspaceId) return { kind: 'hold', reason: 'no_delegation' }
    const row = await this.delegations.findOne({ where: { id: delegationId, workspace_id: workspaceId } })
    // Condition présente, mandat introuvable ⇒ « inconnu ⇒ attend ».
    if (!row) return { kind: 'hold', reason: 'no_delegation' }
    const verdict = await this.verdictFor(row, message, caps, now)
    if (verdict.decision === 'stop') return { kind: 'stop', reason: verdict.reason }
    if (verdict.decision === 'awaits_validation') return { kind: 'hold', reason: verdict.reason }
    if (!(await this.reserve(row.id))) return { kind: 'hold', reason: 'quota_reached' }
    return { kind: 'run', delegationId: row.id }
  }

  /** « Ne me contactez plus » dans un espace — même table que `ContactStopService`, pour le dispatcher. */
  stopLookup(workspaceId: string): StopLookup {
    return async contactIds => {
      if (contactIds.length === 0) return new Set<string>()
      const rows = await this.contactStops.find({
        where: { workspace_id: workspaceId, contact_id: In([...contactIds]) },
        select: ['contact_id'],
      })
      return new Set(rows.map(row => row.contact_id))
    }
  }

  /** UPDATE conditionnel : deux passages ne dépassent jamais le plafond, un mandat révoqué ne réserve rien. */
  private async reserve(delegationId: string): Promise<boolean> {
    const reserved = await this.delegations
      .createQueryBuilder()
      .update()
      .set({ sent_count: () => 'sent_count + 1' })
      .where('id = :id AND sent_count < max_messages AND revoked_at IS NULL', { id: delegationId })
      .execute()
    return Boolean(reserved.affected)
  }

  private assertMailbox(status: MailboxStatus, senderMailboxId: string): void {
    if (!status.connected || !status.capabilities.send) {
      throw new BadRequestException({ code: 'mailbox_unavailable', message: "Aucune messagerie d'envoi connectée." })
    }
    if (status.address !== senderMailboxId) {
      throw new BadRequestException({ code: 'sender_mismatch', message: "L'expéditeur n'est pas la boîte connectée." })
    }
  }

  /** Un mandat qui peut encore agir (ou agira) : ni révoqué, ni expiré, ni épuisé. */
  private isLive(row: OutreachDelegationEntity, now: Date): boolean {
    const lifecycle = delegationLifecycle(this.toDelegation(row), now)
    return lifecycle === 'active' || lifecycle === 'paused' || lifecycle === 'not_started'
  }

  /** Rend l'envoi réservé si le connecteur n'a rien envoyé : le plafond compte les envois, pas les essais. */
  async release(delegationId: string): Promise<void> {
    await this.delegations
      .createQueryBuilder()
      .update()
      .set({ sent_count: () => 'GREATEST(sent_count - 1, 0)' })
      .where('id = :id', { id: delegationId })
      .execute()
  }

  /** Statut réel par étape, en lecture seule (jamais de réservation de quota). */
  async steps(
    ctx: OutreachCtx,
    id: string,
    caps: MailboxStatus,
    now: Date = new Date(),
  ): Promise<{ message_id: string; contact_id: string; status: string; verdict: DelegationVerdict }[]> {
    const row = await this.owned(ctx, id)
    const rows = await this.messages.findByIds(
      row.workspace_id,
      row.messages.map(m => m.id),
    )
    const out: { message_id: string; contact_id: string; status: string; verdict: DelegationVerdict }[] = []
    for (const message of rows) {
      out.push({
        message_id: message.id,
        contact_id: message.contact_id,
        status: message.status,
        verdict: await this.verdictFor(row, message, caps, now),
      })
    }
    return out
  }

  /**
   * #4016 L5 (reprise 20/10) — la séquence d'un message, relue À CET ENVOI, dans SON espace.
   * Arrêtée, terminée, étape faite ou sautée, introuvable, ou tables absentes : `over` (le message
   * sort de la file, reste en relecture). En pause : `paused` (passager). Sinon l'échéance vivante.
   */
  private async liveSequenceStep(
    message: OutreachMessageEntity,
  ): Promise<{ kind: 'over' } | { kind: 'paused' } | { kind: 'manual_only' } | { kind: 'due'; dueAt: Date }> {
    const over = { kind: 'over' } as const
    if (!this.sequences || !this.sequenceSteps) return over
    if (!message.workspace_id || !message.sequence_id || !message.sequence_step_id) return over
    const sequence = await this.sequences.findOne({
      where: { id: message.sequence_id, workspace_id: message.workspace_id },
    })
    if (!sequence || sequence.status === 'cancelled' || sequence.status === 'completed') return over
    const step = await this.sequenceSteps.findOne({
      where: { id: message.sequence_step_id, sequence_id: message.sequence_id },
    })
    if (!step || step.status !== 'pending') return over
    // #5029.2 — une séquence qui PROPOSE un consultant reste TOUJOURS manuelle, même mandat signé.
    if (sequence.consultant_id) return { kind: 'manual_only' }
    if (sequence.status === 'paused') return { kind: 'paused' }
    return { kind: 'due', dueAt: new Date(step.due_at) }
  }

  private async verdictFor(
    row: OutreachDelegationEntity,
    message: OutreachMessageEntity,
    caps: MailboxStatus,
    now: Date,
    originatedOverride?: Date,
  ): Promise<DelegationVerdict> {
    const workspaceId = row.workspace_id
    const replied = await this.messages.repliedAmong(workspaceId, [message.contact_id], row.campaign_label)
    const stopped =
      (await this.contactStops.count({ where: { workspace_id: workspaceId, contact_id: In([message.contact_id]) } })) >
      0
    const contact = await this.contacts.findOne({
      where: { id: message.contact_id, workspace_id: workspaceId },
      select: ['id', 'excluded_at', 'deleted_at'],
    })
    // #4016 L5 — relus À CHAQUE ENVOI : une fiche disparue est une personne effacée (c69, l'effacement
    // RGPD supprime la ligne) ; une fiche mise à la corbeille est écartée.
    const erased = !contact
    const excluded = Boolean(contact?.excluded_at) || Boolean(contact?.deleted_at)
    const reviewed = row.messages.find(m => m.id === message.id)
    return delegationVerdict({
      now,
      delegation: this.toDelegation(row),
      step: {
        kind: 'email',
        channel: message.channel,
        contact_id: message.contact_id,
        // Une version différente de celle relue ⇒ empreinte différente ⇒ nouvelle validation.
        content_hash: reviewed && reviewed.version === message.current_version ? (row.content_hash ?? '') : 'changed',
        sender_mailbox_id: caps.address ?? null,
        // #4016 L5 — la portée vient du MESSAGE : un message de campagne ne profite jamais d'un mandat d'espace.
        scope: message.mandate_scope ?? 'campaign',
        originated_at: originatedOverride
          ? originatedOverride.toISOString()
          : message.mandate_originated_at
            ? new Date(message.mandate_originated_at).toISOString()
            : null,
      },
      // c45 (consentement) porte sur les CONSULTANTS : un contact prospect n'a pas de consentement
      // enregistré, il n'y a donc rien d'expiré à lire — jamais une valeur devinée.
      contact: {
        replied: replied.has(message.contact_id),
        opposed: stopped,
        excluded,
        erased,
        consent_expired: false,
      },
      capabilities: {
        mailbox_connected: caps.connected && caps.capabilities.send,
        reply_reading_available: caps.connected && caps.capabilities.read,
      },
    })
  }

  private async owned(ctx: OutreachCtx, id: string): Promise<OutreachDelegationEntity> {
    const row = ctx.workspaceId
      ? await this.delegations.findOne({ where: { id, workspace_id: ctx.workspaceId } })
      : null
    if (!row || row.scope === 'linkedin_send') throw new NotFoundException('Mandat introuvable.')
    return row
  }

  private toDelegation(row: OutreachDelegationEntity): OutreachDelegation {
    return {
      id: row.id,
      workspace_id: row.workspace_id,
      scope: row.scope ?? 'campaign',
      campaign_label: row.campaign_label,
      contact_ids: row.contact_ids,
      channels: row.channels as OutreachDelegation['channels'],
      sender_mailbox_id: row.sender_mailbox_id,
      content_hash: row.content_hash,
      window: { start_hour: row.window_start_hour, end_hour: row.window_end_hour },
      starts_at: new Date(row.starts_at).toISOString(),
      expires_at: new Date(row.expires_at).toISOString(),
      max_messages: row.max_messages,
      sent_count: row.sent_count,
      validated_by: row.validated_by,
      validated_at: new Date(row.validated_at).toISOString(),
      revoked_at: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
      paused_at: row.paused_at ? new Date(row.paused_at).toISOString() : null,
    }
  }

  private toView(row: OutreachDelegationEntity, now: Date): OutreachDelegationView {
    const d = this.toDelegation(row)
    return {
      id: d.id,
      scope: d.scope,
      renewed_from: row.renewed_from ?? null,
      campaign_label: d.campaign_label,
      contact_count: d.contact_ids.length,
      channels: d.channels,
      sender_mailbox_id: d.sender_mailbox_id,
      window: d.window,
      starts_at: d.starts_at,
      expires_at: d.expires_at,
      max_messages: d.max_messages,
      sent_count: d.sent_count,
      validated_by: d.validated_by,
      validated_at: d.validated_at,
      revoked_at: d.revoked_at,
      paused_at: d.paused_at,
      lifecycle: delegationLifecycle(d, now),
    }
  }
}
