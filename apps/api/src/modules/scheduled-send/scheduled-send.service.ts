import { InjectQueue } from '@nestjs/bullmq'
import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import type { Queue } from 'bullmq'
import { In, IsNull, LessThanOrEqual, type Repository } from 'typeorm'
import {
  SCHEDULABLE_DRAFT_CHANNELS,
  type MessageDraftChannel,
  type RescheduleMessageSendRequest,
  type ScheduleMessageSendRequest,
  type ScheduledMessageSendItem,
  type ScheduledSendStatus,
} from '@bellum/contracts'
import { ContactEntity } from '../../database/entities/contact.entity'
import { MessageDraftValidationEntity } from '../../database/entities/message-draft-validation.entity'
import { MessageDraftVersionEntity } from '../../database/entities/message-draft-version.entity'
import { ScheduledMessageSendEntity } from '../../database/entities/scheduled-message-send.entity'
import { draftContentHash, effectiveDraftContent } from '../message-drafts/draft-content-hash'
import { SCHEDULED_SEND_CLOCK, SCHEDULED_SEND_TRANSPORT, type ScheduledSendTransport } from './module-tokens'
import {
  PROOF_FIRST_LOOK_DELAY_MS,
  SCHEDULED_SEND_DISPATCH_OPTIONS,
  SCHEDULED_SEND_PROOF_OPTIONS,
  SCHEDULED_SEND_QUEUE,
  dispatchJobId,
  proofJobId,
  type ScheduledSendJobData,
} from './scheduled-send.queue'

/** Au-delà d'un an, une date est une faute de frappe plus qu'une intention. */
const MAX_HORIZON_MS = 366 * 24 * 60 * 60 * 1000
/** « À venir » : les envois programmés, et ce qui en est sorti récemment (parti, inconnu, échec). */
const UPCOMING_WINDOW = 100
/** Le seul refus du chemin de clic qui dit « peut-être parti » : il n'est pas un échec. */
const UNCERTAIN_CODES: ReadonlySet<string> = new Set(['send_uncertain'])

type DispatchResult = ScheduledSendStatus | 'skipped'

/**
 * Théo M2 — envoi programmé — DÉCISION LOUIS 22/10/2026.
 *
 * Un brouillon VALIDÉ par le commercial part à l'heure qu'il a choisie, seul, par SA boîte branchée — par le chemin
 * de « Envoyer » au clic (`ScheduledSendTransport.sendEmail`), jamais un second moteur. Ce n'est pas Laura qui
 * envoie : c'est le geste du commercial (valider + programmer), décalé dans le temps (`c102`).
 *
 * Trois verrous, dans cet ordre, avant que rien ne parte (GA-375 en lit l'ordre) :
 *  1. la validation tient encore — même espace actif, même version, même empreinte (`assertStillValidated`) ;
 *  2. la ligne est RÉSERVÉE par une écriture conditionnelle (`attempted_at` posé) — un passage concurrent, une
 *     reprise BullMQ ou un job périmé ne passent pas ;
 *  3. le chemin du clic garde ses propres gardes (démo, désinscription, réservation par contact).
 * Une tentative commencée ne se rejoue jamais : sans réponse, elle devient `unknown` et la reprise s'arrête.
 */
@Injectable()
export class ScheduledSendService {
  private readonly logger = new Logger(ScheduledSendService.name)

  constructor(
    @InjectRepository(ScheduledMessageSendEntity)
    private readonly sends: Repository<ScheduledMessageSendEntity>,
    @InjectRepository(MessageDraftVersionEntity)
    private readonly versions: Repository<MessageDraftVersionEntity>,
    @InjectRepository(MessageDraftValidationEntity)
    private readonly validations: Repository<MessageDraftValidationEntity>,
    @InjectRepository(ContactEntity)
    private readonly contacts: Repository<ContactEntity>,
    @InjectQueue(SCHEDULED_SEND_QUEUE)
    private readonly queue: Pick<Queue<ScheduledSendJobData>, 'add' | 'getJob'>,
    @Inject(SCHEDULED_SEND_TRANSPORT)
    private readonly transport: ScheduledSendTransport,
    @Inject(SCHEDULED_SEND_CLOCK)
    private readonly now: () => Date,
  ) {}

  async schedule(
    workspaceId: string,
    userId: string,
    input: ScheduleMessageSendRequest,
  ): Promise<ScheduledMessageSendItem> {
    const scheduledAt = this.futureDate(input.scheduledAt)
    const version = await this.versions.findOne({
      where: { id: input.versionId, workspace_id: workspaceId, recorded_by: userId },
    })
    if (!version) throw new NotFoundException('Brouillon introuvable dans ton espace')
    if (!(SCHEDULABLE_DRAFT_CHANNELS as readonly string[]).includes(version.channel)) {
      throw new BadRequestException('Seul un e-mail peut être programmé : il part par ta boîte branchée.')
    }
    const validation = await this.validations.findOne({ where: { version_id: version.id, workspace_id: workspaceId } })
    if (!validation || validation.validated_by !== userId || validation.content_hash !== draftContentHash(version)) {
      throw new ConflictException('Valide ce brouillon avant de programmer son envoi.')
    }

    const live = await this.liveSendOf(workspaceId, userId, version.id)
    if (live) return this.toItem(live, version, null)

    let saved: ScheduledMessageSendEntity
    try {
      saved = await this.sends.save(
        this.sends.create({
          workspace_id: workspaceId,
          user_id: userId,
          version_id: version.id,
          validation_id: validation.id,
          contact_id: version.contact_id,
          content_hash: validation.content_hash,
          scheduled_at: scheduledAt,
          time_zone: input.timeZone,
          status: 'scheduled',
        }),
      )
    } catch (cause) {
      // Deux clics simultanés : l'index unique partiel n'en laisse passer qu'un, l'autre rend la ligne vivante.
      const raced =
        (cause as { code?: string }).code === '23505' && (await this.liveSendOf(workspaceId, userId, version.id))
      if (raced) return this.toItem(raced, version, null)
      throw cause
    }
    await this.enqueueDispatch(saved.id, scheduledAt)
    return this.toItem(saved, version, null)
  }

  async reschedule(
    workspaceId: string,
    userId: string,
    id: string,
    input: RescheduleMessageSendRequest,
  ): Promise<ScheduledMessageSendItem> {
    const scheduledAt = this.futureDate(input.scheduledAt)
    const current = await this.ownedSend(workspaceId, userId, id)
    const moved = await this.sends.update(
      { id, workspace_id: workspaceId, user_id: userId, status: 'scheduled', attempted_at: IsNull() },
      { scheduled_at: scheduledAt, time_zone: input.timeZone },
    )
    if (!moved.affected) throw new ConflictException('Cet envoi est déjà parti ou annulé : son heure ne bouge plus.')
    await this.removeDispatch(id, current.scheduled_at)
    await this.enqueueDispatch(id, scheduledAt)
    return this.itemOf({ ...current, scheduled_at: scheduledAt, time_zone: input.timeZone })
  }

  async cancel(workspaceId: string, userId: string, id: string): Promise<ScheduledMessageSendItem> {
    const current = await this.ownedSend(workspaceId, userId, id)
    const cancelled = await this.sends.update(
      { id, workspace_id: workspaceId, user_id: userId, status: 'scheduled', attempted_at: IsNull() },
      { status: 'cancelled' },
    )
    if (!cancelled.affected) throw new ConflictException('Cet envoi est déjà parti ou annulé.')
    await this.removeDispatch(id, current.scheduled_at)
    return this.itemOf({ ...current, status: 'cancelled' })
  }

  /** « À venir » côté envois : ceux de CET utilisateur dans CET espace — les programmés d'abord, par heure. */
  async listUpcoming(workspaceId: string, userId: string): Promise<{ items: ScheduledMessageSendItem[] }> {
    const rows = await this.sends.find({
      where: { workspace_id: workspaceId, user_id: userId },
      order: { scheduled_at: 'DESC' },
      take: UPCOMING_WINDOW,
    })
    if (rows.length === 0) return { items: [] }
    const versions = await this.versions.find({
      where: { id: In([...new Set(rows.map(r => r.version_id))]), workspace_id: workspaceId },
    })
    const contacts = await this.contacts.find({
      where: { id: In([...new Set(rows.map(r => r.contact_id))]), workspace_id: workspaceId },
      select: ['id', 'email_send_channel', 'email_sent_observed_at'],
    })
    const versionById = new Map(versions.map(v => [v.id, v]))
    const contactById = new Map(contacts.map(c => [c.id, c]))
    const items = rows.flatMap(r => {
      const version = versionById.get(r.version_id)
      return version ? [this.toItem(r, version, this.proofOf(r, contactById.get(r.contact_id)))] : []
    })
    const live = items.filter(i => i.status === 'scheduled').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    return { items: [...live, ...items.filter(i => i.status !== 'scheduled')] }
  }

  /** Le départ, appelé par le worker à l'heure dite. Rend ce qui s'est passé ; `skipped` = rien à faire. */
  async dispatch(id: string): Promise<DispatchResult> {
    const send = await this.sends.findOne({ where: { id } })
    const now = this.now()
    if (!send || send.status !== 'scheduled' || send.scheduled_at.getTime() > now.getTime()) return 'skipped'
    if (send.attempted_at) {
      // Une tentative a commencé puis le passage s'est coupé : le message est PEUT-ÊTRE parti. On ne renvoie pas.
      await this.sends.update({ id, status: 'scheduled' }, { status: 'unknown', failure_code: 'attempt_interrupted' })
      return 'unknown'
    }

    const checked = await this.assertStillValidated(send)
    if ('refused' in checked) {
      await this.sends.update(
        { id, status: 'scheduled', attempted_at: IsNull() },
        { status: 'failed', failure_code: checked.refused },
      )
      return 'failed'
    }

    const claimed = await this.sends.update(
      { id, status: 'scheduled', attempted_at: IsNull(), scheduled_at: LessThanOrEqual(now) },
      { attempted_at: now },
    )
    if (!claimed.affected) return 'skipped'

    let outcome: Awaited<ReturnType<ScheduledSendTransport['sendEmail']>>
    try {
      outcome = await this.transport.sendEmail(send.contact_id, send.user_id, checked.draft)
    } catch (cause) {
      this.logger.warn('Envoi programmé sans réponse : classé inconnu, aucune reprise', {
        scheduledSendId: id,
        message: cause instanceof Error ? cause.message : String(cause),
      })
      await this.sends.update({ id }, { status: 'unknown', failure_code: 'transport_no_answer' })
      return 'unknown'
    }

    if (outcome.ok) {
      await this.sends.update({ id }, { status: 'sent', sent_at: this.now(), failure_code: null })
      await this.queue.add(
        'proof',
        { scheduledSendId: id },
        {
          ...SCHEDULED_SEND_PROOF_OPTIONS,
          jobId: proofJobId(id),
          delay: PROOF_FIRST_LOOK_DELAY_MS,
        },
      )
      return 'sent'
    }
    const status: ScheduledSendStatus = UNCERTAIN_CODES.has(outcome.code) ? 'unknown' : 'failed'
    await this.sends.update({ id }, { status, failure_code: outcome.code })
    return status
  }

  /**
   * La preuve : le message retrouvé dans les éléments envoyés de la boîte. Relit la boîte par le chemin existant
   * (qui pose `contacts.email_sent_observed_at`), puis regarde. `false` = pas (encore) retrouvé.
   */
  async confirmProof(id: string): Promise<boolean> {
    const send = await this.sends.findOne({ where: { id } })
    if (!send || send.status !== 'sent' || !send.attempted_at) return true
    const where = { id: send.contact_id, workspace_id: send.workspace_id }
    const contact = await this.contacts.findOne({ where })
    if (this.proofOf(send, contact ?? undefined)) return true
    if (!contact?.email) return false
    await this.transport.lookForSentProof(send.user_id, contact.email)
    const reread = await this.contacts.findOne({ where })
    return this.proofOf(send, reread ?? undefined) !== null
  }

  /** Verrou 1 — la validation du commercial tient encore, sur le texte EXACT qu'il a relu. */
  private async assertStillValidated(
    send: ScheduledMessageSendEntity,
  ): Promise<{ draft: { subject?: string; body: string } } | { refused: string }> {
    const active = await this.transport.activeWorkspace(send.user_id)
    if (active !== send.workspace_id) return { refused: 'workspace_changed' }
    const version = await this.versions.findOne({ where: { id: send.version_id, workspace_id: send.workspace_id } })
    const validation = await this.validations.findOne({
      where: { id: send.validation_id, version_id: send.version_id, workspace_id: send.workspace_id },
    })
    if (!version || !validation || validation.validated_by !== send.user_id) return { refused: 'validation_missing' }
    const hash = draftContentHash(version)
    if (hash !== send.content_hash || hash !== validation.content_hash) return { refused: 'validation_mismatch' }
    const { subject, body } = effectiveDraftContent(version)
    return { draft: subject ? { subject, body } : { body } }
  }

  private proofOf(
    send: ScheduledMessageSendEntity,
    contact: Pick<ContactEntity, 'email_send_channel' | 'email_sent_observed_at'> | undefined,
  ): string | null {
    const observed = contact?.email_sent_observed_at
    if (send.status !== 'sent' || !send.attempted_at || contact?.email_send_channel !== 'mailbox' || !observed) {
      return null
    }
    return observed.getTime() >= send.attempted_at.getTime() ? observed.toISOString() : null
  }

  private futureDate(iso: string): Date {
    const at = new Date(iso)
    const delta = at.getTime() - this.now().getTime()
    if (Number.isNaN(delta) || delta <= 0) throw new BadRequestException("Choisis une heure à venir pour l'envoi.")
    if (delta > MAX_HORIZON_MS) throw new BadRequestException("Un envoi se programme au plus un an à l'avance.")
    return at
  }

  private async ownedSend(workspaceId: string, userId: string, id: string): Promise<ScheduledMessageSendEntity> {
    const send = await this.sends.findOne({ where: { id, workspace_id: workspaceId, user_id: userId } })
    if (!send) throw new NotFoundException('Envoi programmé introuvable')
    return send
  }

  private liveSendOf(
    workspaceId: string,
    userId: string,
    versionId: string,
  ): Promise<ScheduledMessageSendEntity | null> {
    return this.sends.findOne({
      where: { version_id: versionId, workspace_id: workspaceId, user_id: userId, status: 'scheduled' },
    })
  }

  private async enqueueDispatch(id: string, at: Date): Promise<void> {
    await this.queue.add(
      'dispatch',
      { scheduledSendId: id },
      {
        ...SCHEDULED_SEND_DISPATCH_OPTIONS,
        jobId: dispatchJobId(id, at),
        delay: Math.max(0, at.getTime() - this.now().getTime()),
      },
    )
  }

  /** Best-effort : un job resté dans la file relit la ligne et ne fait rien — la base fait foi, pas la file. */
  private async removeDispatch(id: string, at: Date): Promise<void> {
    try {
      await (await this.queue.getJob(dispatchJobId(id, at)))?.remove()
    } catch (cause) {
      this.logger.warn('Job d’envoi programmé non retiré (il relira la ligne et ne fera rien)', {
        scheduledSendId: id,
        message: cause instanceof Error ? cause.message : String(cause),
      })
    }
  }

  private async itemOf(send: ScheduledMessageSendEntity): Promise<ScheduledMessageSendItem> {
    const version = await this.versions.findOne({ where: { id: send.version_id, workspace_id: send.workspace_id } })
    if (!version) throw new NotFoundException('Brouillon introuvable dans ton espace')
    return this.toItem(send, version, null)
  }

  private toItem(
    send: ScheduledMessageSendEntity,
    version: MessageDraftVersionEntity,
    proofSentAt: string | null,
  ): ScheduledMessageSendItem {
    return {
      id: send.id,
      versionId: send.version_id,
      contactId: send.contact_id,
      channel: version.channel as MessageDraftChannel,
      subject: effectiveDraftContent(version).subject,
      scheduledAt: send.scheduled_at.toISOString(),
      timeZone: send.time_zone,
      status: send.status as ScheduledSendStatus,
      attemptedAt: send.attempted_at?.toISOString() ?? null,
      sentAt: send.sent_at?.toISOString() ?? null,
      proofSentAt,
      failureCode: send.failure_code,
      createdAt: send.created_at.toISOString(),
    }
  }
}
