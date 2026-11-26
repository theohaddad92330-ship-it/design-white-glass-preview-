import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { OwnerInvitationEntity } from '../../database/entities/owner-invitation.entity'
import { renderOwnerInvitationEmail } from './manual-provisioning-plan'
import { MailerService } from '../mailer/mailer.service'
import { dueFollowUp } from './owner-activation-followup'

/** Pourquoi {@link OwnerActivationService.send} a refusé. */
type SendOwnerInvitationRefusalReason = 'not_found' | 'no_link' | 'not_due_yet' | 'cadence_exhausted'

export interface SendOwnerInvitationResult {
  sent: true
  state: OwnerActivationState
}

export interface SendOwnerInvitationRefusal {
  sent: false
  reason: SendOwnerInvitationRefusalReason
}

/** Ce que l'écran back-office (`/esn/[id]`) affiche de l'activation d'un siège
 *  provisionné à la main — #2643.2. */
export interface OwnerActivationState {
  workspaceId: string
  email: string
  ownerFirstName: string | null
  esnName: string
  planLabel: string
  /** `false` quand le lien n'a pas pu être engendré — `error` dit pourquoi. */
  prepared: boolean
  error: string | null
  expiresAt: string | null
  /** `null` = jamais envoyé. */
  sentAt: string | null
  sentBy: string | null
  /** Le nombre d'envois consignés (initial + relances). */
  sendCount: number
  alertedAt: string | null
}

/**
 * L'activation du propriétaire d'un siège provisionné à la main — #2643.2,
 * #2643.1, #2643.3.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE SERVICE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Avant lui, `ManualProvisioningService.prepareOwnerInvitation` rendait un
 * `OwnerInvitation` qui ne vivait que le temps de la réponse HTTP de création
 * (#2643.2 : « personne ne peut savoir où en est une activation »). Ce
 * service persiste cet état et devient le SEUL endroit qui l'écrit — l'écran
 * `/esn/[id]` et le clic d'envoi (#2643.1) lisent et écrivent la même ligne.
 *
 * Une ligne par espace (`workspace_id` unique) : `persist` met à jour la ligne
 * existante plutôt que d'en créer une seconde.
 */
@Injectable()
export class OwnerActivationService {
  constructor(
    @InjectRepository(OwnerInvitationEntity)
    private readonly invitations: Repository<OwnerInvitationEntity>,
    // #2643.1 — le SEUL appelant de `MailerService` pour cet e-mail dans tout
    // le dépôt. `manual-provisioning.service.spec.ts` prouve qu'aucun chemin
    // de provisionnement n'appelle `send` de lui-même.
    private readonly mailer: MailerService,
  ) {}

  /**
   * Persiste ce que `ManualProvisioningService.prepareOwnerInvitation` vient
   * de préparer. Jamais d'envoi ici — voir {@link send}.
   */
  async persist(input: {
    workspaceId: string
    userId: string
    email: string
    ownerFirstName: string | null
    esnName: string
    planLabel: string
    link: string | null
    expiresAt: string | null
    error: string | null
  }): Promise<void> {
    const existing = await this.invitations.findOne({ where: { workspace_id: input.workspaceId } })
    await this.invitations.save({
      ...(existing ?? {}),
      workspace_id: input.workspaceId,
      user_id: input.userId,
      email: input.email,
      owner_first_name: input.ownerFirstName,
      esn_name: input.esnName,
      plan_label: input.planLabel,
      link: input.link,
      expires_at: input.expiresAt ? new Date(input.expiresAt) : null,
      error: input.error,
      sent_at: existing?.sent_at ?? null,
      sends: existing?.sends ?? [],
    })
  }

  async getState(workspaceId: string): Promise<OwnerActivationState | null> {
    const row = await this.invitations.findOne({ where: { workspace_id: workspaceId } })
    return row ? toState(row) : null
  }

  /**
   * L'ENVOI — #2643.1, décision Louis 20/09/2026 : « l'envoi garde un geste
   * opérateur ». Un provisionnement raté préparerait quand même l'e-mail ;
   * l'envoyer automatiquement enverrait à un vrai client sur un espace
   * peut-être jamais réellement créé. Cette méthode n'a donc qu'UN appelant
   * légitime : le clic « Envoyer » du back-office (`InternalAdminController`).
   *
   * Sert aussi à la relance J+2/J+5 (#2643.3) : renvoyer, c'est rappeler ce
   * même lien — `sends` s'allonge, il ne se remplace pas.
   */
  async send(
    workspaceId: string,
    actorEmail: string,
    today: string = new Date().toISOString(),
  ): Promise<SendOwnerInvitationResult | SendOwnerInvitationRefusal> {
    const row = await this.invitations.findOne({ where: { workspace_id: workspaceId } })
    if (!row) return { sent: false, reason: 'not_found' }
    if (!row.link) return { sent: false, reason: 'no_link' }

    // #2643.3 — la cadence J+2/J+5 n'engage QUE les relances. L'envoi
    // INITIAL (`sent_at` encore `null`) part dès que l'opérateur clique : rien
    // dans la décision de Louis du 20/09/2026 ne retarde le premier envoi.
    if (row.sent_at) {
      const remindersSent = Math.max(0, row.sends.length - 1)
      const followUp = dueFollowUp({ firstSentOn: row.sent_at.toISOString(), remindersSent, today })
      if (!followUp.due) return { sent: false, reason: followUp.reason }
    }

    const email = renderOwnerInvitationEmail({
      ownerEmail: row.email,
      ownerFirstName: row.owner_first_name ?? undefined,
      esnName: row.esn_name,
      planLabel: row.plan_label,
      link: row.link,
      expiresAt: row.expires_at ? row.expires_at.toISOString() : null,
    })

    // #2643.1 — le seul appel d'envoi de tout ce lot, atteint UNIQUEMENT
    // depuis ce clic opérateur.
    await this.mailer.sendOwnerInvitationEmail({ to: email.to, subject: email.subject, body: email.body })

    const now = new Date()
    row.sent_at = now
    row.sent_by = actorEmail
    row.sends = [...row.sends, { at: now.toISOString(), by: actorEmail }]
    await this.invitations.save(row)

    return { sent: true, state: toState(row) }
  }
}

function toState(row: OwnerInvitationEntity): OwnerActivationState {
  return {
    workspaceId: row.workspace_id,
    email: row.email,
    ownerFirstName: row.owner_first_name,
    esnName: row.esn_name,
    planLabel: row.plan_label,
    prepared: row.link !== null,
    error: row.error,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    sentAt: row.sent_at ? new Date(row.sent_at).toISOString() : null,
    sentBy: row.sent_by,
    sendCount: row.sends.length,
    alertedAt: row.alerted_at ? new Date(row.alerted_at).toISOString() : null,
  }
}
