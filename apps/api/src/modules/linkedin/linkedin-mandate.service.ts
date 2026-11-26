import {
  DELEGATION_MAX_DAYS,
  type LinkedInMandateView,
  type LinkedInSendStatus,
  type LinkedInSendStatusView,
  type LinkedInSendView,
} from '@bellum/contracts'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { Repository } from 'typeorm'
import type { ContactEntity } from '../../database/entities/contact.entity'
import { LinkedInInteractionEntity } from '../../database/entities/linkedin-interaction.entity'
import { OutreachDelegationEntity } from '../../database/entities/outreach-delegation.entity'
import { LinkedInSendLogEntity } from '../../database/entities/linkedin-send-log.entity'
import { decideSend, LINKEDIN_DAILY_SEND_LIMIT, type Mandate } from './linkedin-mandate'
import type { UnipileLinkedInSender } from './linkedin-sender'

/**
 * Ce que le mandat lit de l'espace : l'espace actif et l'état démo. Un PORT local, pas l'import du service
 * d'un autre module (GA-07 : un fichier de plus qui va chercher un service ne passe pas) — le module
 * (`linkedin.module.ts`) y branche `WorkspaceContextService`, qui le satisfait tel quel.
 */
interface MandateWorkspacePort {
  resolveActiveWorkspace(userId: string): Promise<{ workspaceId: string }>
  isDemoWorkspace(userId: string): Promise<boolean>
}

/**
 * Le mandat d'envoi LinkedIn et le geste d'envoi (#4737).
 *
 * FUSION (Louis, 29/10/2026) : le mandat est une ligne de `outreach_delegations` (portée `linkedin_send`),
 * la même notion de délégation que l'e-mail — pas une table à part (GA-26). La table `linkedin_mandates`
 * du premier lot est ARCHIVÉE, reprise par migration, plus lue ici.
 *
 * Aucune méthode ne rend ni ne journalise le CORPS du message : il va de la
 * requête au journal (`linkedin_send_log.body`) et au fournisseur, point.
 * Les vues ci-dessus n'ont pas de champ pour lui.
 */
@Injectable()
export class LinkedInMandateService {
  constructor(
    private readonly mandates: Repository<OutreachDelegationEntity>,
    private readonly sendLog: Repository<LinkedInSendLogEntity>,
    private readonly interactions: Repository<LinkedInInteractionEntity>,
    private readonly contacts: Repository<ContactEntity>,
    private readonly workspaceContext: MandateWorkspacePort,
    private readonly sender: UnipileLinkedInSender,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /** Donne un mandat. Un seul mandat actif : le nouveau révoque le précédent. */
  async grant(
    userId: string,
    input: { validFrom?: string; validUntil: string; dailyLimit?: number },
  ): Promise<LinkedInMandateView> {
    const dailyLimit = input.dailyLimit ?? LINKEDIN_DAILY_SEND_LIMIT
    if (!Number.isInteger(dailyLimit) || dailyLimit < 1 || dailyLimit > LINKEDIN_DAILY_SEND_LIMIT) {
      throw new BadRequestException(`La borne est de 1 à ${LINKEDIN_DAILY_SEND_LIMIT} envois par jour.`)
    }
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const now = this.now()
    const validFrom = input.validFrom ? new Date(input.validFrom) : now
    const validUntil = new Date(input.validUntil)
    if (!(validUntil.getTime() > validFrom.getTime())) {
      throw new BadRequestException('La fin du mandat doit suivre son début.')
    }
    // Période bornée comme tout mandat d'envoi (`DELEGATION_MAX_DAYS`) : un mandat sans fin n'en est pas un.
    if (validUntil.getTime() - validFrom.getTime() > DELEGATION_MAX_DAYS * 86_400_000) {
      throw new BadRequestException(`Un mandat dure ${DELEGATION_MAX_DAYS} jours au plus.`)
    }
    for (const previous of await this.linkedinMandates(userId)) {
      if (!previous.revoked_at) await this.mandates.save({ ...previous, revoked_at: now })
    }
    // Total de la période (colonne `max_messages` partagée) : la borne du jour × le nombre de jours.
    const days = Math.max(1, Math.ceil((validUntil.getTime() - validFrom.getTime()) / 86_400_000))
    const saved = await this.mandates.save(
      this.mandates.create({
        workspace_id: workspaceId,
        user_id: userId,
        scope: 'linkedin_send',
        renewed_from: null,
        campaign_label: 'LinkedIn',
        contact_ids: [],
        // LinkedIn n'est pas un canal e-mail délégable : le dispatcher outreach ne lit jamais cette ligne.
        channels: [],
        sender_mailbox_id: 'linkedin',
        messages: [],
        content_hash: null,
        window_start_hour: 0,
        window_end_hour: 24,
        starts_at: validFrom,
        expires_at: validUntil,
        max_messages: dailyLimit * days,
        sent_count: 0,
        daily_limit: dailyLimit,
        validated_by: [userId],
        validated_at: now,
        revoked_at: null,
        paused_at: null,
      }),
    )
    return this.toView(saved)
  }

  /** Révocation immédiate : vaut pour tout ce qui n'est pas encore parti. */
  async revoke(userId: string, mandateId: string): Promise<LinkedInMandateView> {
    const mandate = await this.mandates.findOne({ where: { id: mandateId, user_id: userId, scope: 'linkedin_send' } })
    if (!mandate) throw new NotFoundException('Mandat introuvable.')
    if (mandate.revoked_at) return this.toView(mandate)
    return this.toView(await this.mandates.save({ ...mandate, revoked_at: this.now() }))
  }

  /** Le mandat le plus récent, ou null — jamais un mandat inventé. */
  async current(userId: string): Promise<LinkedInMandateView | null> {
    const latest = await this.latestMandate(userId)
    return latest ? this.toView(latest) : null
  }

  /** L'état lu par l'écran. Aucun champ pour le corps ni pour les identifiants du client. */
  async status(userId: string): Promise<LinkedInSendStatusView> {
    const latest = await this.latestMandate(userId)
    const mandate = latest ? this.toView(latest) : null
    const sentToday = await this.countSentToday(userId)
    const limit = latest ? Math.min(latest.daily_limit ?? LINKEDIN_DAILY_SEND_LIMIT, LINKEDIN_DAILY_SEND_LIMIT) : 0
    return {
      mandate,
      dailyLimit: LINKEDIN_DAILY_SEND_LIMIT,
      sentToday,
      remainingToday: mandate?.active ? Math.max(0, limit - sentToday) : 0,
      routeOpen: await this.sender.isOpenFor(userId),
    }
  }

  /** Le journal d'envoi d'un contact — sans le corps. */
  async listSends(userId: string, contactId: string): Promise<LinkedInSendView[]> {
    const rows = await this.sendLog.find({ where: { user_id: userId, contact_id: contactId } })
    return rows.map(row => this.toSendView(row))
  }

  async send(userId: string, input: { contactId: string; body: string }): Promise<LinkedInSendView> {
    const contact = await this.contacts.findOne({ where: { id: input.contactId, user_id: userId } })
    if (!contact) throw new NotFoundException('Contact introuvable.')
    const { workspaceId } = await this.workspaceContext.resolveActiveWorkspace(userId)
    const mandate = await this.latestMandate(userId)

    // Salle de démonstration : le lien part à des inconnus, rien ne part jamais.
    if (await this.workspaceContext.isDemoWorkspace(userId)) {
      return this.record(workspaceId, userId, mandate, input.contactId, 'refused', 'demo')
    }

    const sentToday = await this.countSentToday(userId)
    const previousUnknown = (await this.sendLog.find({ where: { user_id: userId, contact_id: input.contactId } })).some(
      l => l.status === 'unknown',
    )
    const replies = await this.interactions.find({ where: { user_id: userId, contact_id: input.contactId } })
    const recipientReplied = replies.some(
      r => r.kind === 'reply_received' && (!mandate || r.occurred_at.getTime() >= mandate.validated_at.getTime()),
    )

    const decision = decideSend({
      mandate: mandate ? this.toMandate(mandate) : null,
      now: this.now(),
      sentToday,
      recipientReplied,
      previousUnknown,
    })
    if (!decision.allowed) {
      return this.record(workspaceId, userId, mandate, input.contactId, 'refused', decision.reason)
    }

    const outcome = await this.sender.send({ userId, recipientRef: contact.linkedin_url ?? '', body: input.body })
    switch (outcome.kind) {
      case 'not_open':
        return this.record(workspaceId, userId, mandate, input.contactId, 'not_open', null, input.body)
      case 'sent':
        await this.countAgainstMandate(mandate)
        return this.record(workspaceId, userId, mandate, input.contactId, 'sent', null, input.body, outcome.proof)
      case 'unknown':
        // Un timeout compte contre la borne : le message est peut-être parti.
        await this.countAgainstMandate(mandate)
        return this.record(workspaceId, userId, mandate, input.contactId, 'unknown', null, input.body)
      case 'failed':
        return this.record(workspaceId, userId, mandate, input.contactId, 'failed', null, input.body)
    }
  }

  /** Les délégations LinkedIn de l'utilisateur — la portée `linkedin_send` seulement. */
  private linkedinMandates(userId: string): Promise<OutreachDelegationEntity[]> {
    return this.mandates.find({ where: { user_id: userId, scope: 'linkedin_send' } })
  }

  private async latestMandate(userId: string): Promise<OutreachDelegationEntity | null> {
    const rows = await this.linkedinMandates(userId)
    // Le mandat vivant d'abord (un seul n'est jamais révoqué), puis le plus récemment signé.
    const rank = (r: OutreachDelegationEntity) => (r.revoked_at ? 1 : 0)
    return [...rows].sort((a, b) => rank(a) - rank(b) || b.validated_at.getTime() - a.validated_at.getTime())[0] ?? null
  }

  /**
   * Les envois du jour (jour UTC) de l'UTILISATEUR, tous mandats confondus : réussis ou restés incertains.
   * La borne protège son compte LinkedIn, pas un mandat — révoquer puis re-signer ne la remet pas à zéro.
   */
  private async countSentToday(userId: string): Promise<number> {
    const today = this.now().toISOString().slice(0, 10)
    const counted = (s: LinkedInSendStatus) => s === 'sent' || s === 'unknown'
    const logs = await this.sendLog.find({ where: { user_id: userId } })
    return logs.filter(l => counted(l.status) && l.created_at.toISOString().slice(0, 10) === today).length
  }

  /** Le compteur partagé de la délégation (`sent_count`) suit le journal. */
  private async countAgainstMandate(mandate: OutreachDelegationEntity | null): Promise<void> {
    if (mandate) await this.mandates.save({ ...mandate, sent_count: mandate.sent_count + 1 })
  }

  private async record(
    workspaceId: string,
    userId: string,
    mandate: OutreachDelegationEntity | null,
    contactId: string,
    status: LinkedInSendStatus,
    reason: string | null,
    body: string | null = null,
    proof: string | null = null,
  ): Promise<LinkedInSendView> {
    const saved = await this.sendLog.save(
      this.sendLog.create({
        workspace_id: workspaceId,
        user_id: userId,
        mandate_id: mandate?.id ?? null,
        contact_id: contactId,
        status,
        reason,
        body,
        proof_ref: proof,
        created_at: this.now(),
      }),
    )
    return this.toSendView(saved)
  }

  private toMandate(row: OutreachDelegationEntity): Mandate {
    return {
      id: row.id,
      grantedBy: row.user_id,
      grantedAt: row.validated_at,
      validFrom: row.starts_at,
      validUntil: row.expires_at,
      // Une ligne sans borne par jour (jamais écrite par ce service) prend celle du code, pas l'infini.
      dailyLimit: row.daily_limit ?? LINKEDIN_DAILY_SEND_LIMIT,
      revokedAt: row.revoked_at,
    }
  }

  private toView(row: OutreachDelegationEntity): LinkedInMandateView {
    return {
      id: row.id,
      grantedAt: row.validated_at.toISOString(),
      validFrom: row.starts_at.toISOString(),
      validUntil: row.expires_at.toISOString(),
      dailyLimit: Math.min(row.daily_limit ?? LINKEDIN_DAILY_SEND_LIMIT, LINKEDIN_DAILY_SEND_LIMIT),
      revokedAt: row.revoked_at?.toISOString() ?? null,
      active: decideSend({
        mandate: this.toMandate(row),
        now: this.now(),
        sentToday: 0,
        recipientReplied: false,
        previousUnknown: false,
      }).allowed,
    }
  }

  private toSendView(row: LinkedInSendLogEntity): LinkedInSendView {
    return {
      id: row.id,
      status: row.status,
      reason: (row.reason as LinkedInSendView['reason']) ?? null,
      proofVerified: row.status === 'sent' && !!row.proof_ref,
      createdAt: row.created_at.toISOString(),
    }
  }
}
