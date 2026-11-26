import { z } from 'zod'
import { messageDraftChannelSchema } from './message-draft-version.js'

/**
 * Théo M2 — envoi programmé — DÉCISION LOUIS 22/10/2026.
 *
 * Un brouillon VALIDÉ par le commercial peut être programmé à la date et à l'heure qu'il choisit ; il part alors
 * seul, par SA boîte branchée, par le même chemin que « Envoyer » au clic. Ce n'est pas Laura qui envoie : c'est le
 * geste du commercial (valider + programmer), décalé dans le temps (doctrine `c102_envoi_programme_geste_du_commercial`).
 *
 * Cinq statuts, et pas un de plus :
 *  - `scheduled` — programmé, annulable et déplaçable tant que rien n'est parti ;
 *  - `sent` — le transport a pris le message ; « Envoyé le … » attend la PREUVE (retrouvé dans la boîte) ;
 *  - `cancelled` — déprogrammé par le commercial ;
 *  - `failed` — rien n'est parti (refus net : boîte débranchée, contact désabonné, déjà écrit…) ;
 *  - `unknown` — la tentative n'a pas répondu : le message est PEUT-ÊTRE parti. Un timeout n'est pas un échec, et
 *    `unknown` arrête toute reprise : jamais de double envoi.
 */
export const SCHEDULED_SEND_STATUSES = ['scheduled', 'sent', 'cancelled', 'failed', 'unknown'] as const
export const scheduledSendStatusSchema = z.enum(SCHEDULED_SEND_STATUSES)
export type ScheduledSendStatus = z.infer<typeof scheduledSendStatusSchema>

/** Les canaux qu'un envoi programmé sait faire partir : ceux de « Envoyer » au clic (un e-mail), rien d'autre. */
export const SCHEDULABLE_DRAFT_CHANNELS = ['email', 'follow_up_email'] as const

/** Body de `POST /message-drafts/scheduled-sends`. Ni espace ni utilisateur : ils viennent du jeton. */
export const scheduleMessageSendRequestSchema = z.object({
  versionId: z.string().guid(),
  /** Avec décalage horaire, toujours : une heure sans fuseau est une heure devinée. */
  scheduledAt: z.string().datetime({ offset: true }),
  /** Le fuseau de l'utilisateur (IANA), pour redire l'heure telle qu'il l'a choisie. */
  timeZone: z.string().min(1).max(64),
})
export type ScheduleMessageSendRequest = z.infer<typeof scheduleMessageSendRequestSchema>

/** Body de `PATCH /message-drafts/scheduled-sends/:id` — déplacer l'heure, tant que rien n'est parti. */
export const rescheduleMessageSendRequestSchema = scheduleMessageSendRequestSchema.omit({ versionId: true })
export type RescheduleMessageSendRequest = z.infer<typeof rescheduleMessageSendRequestSchema>

/** Une ligne de « À venir » côté envois. Pas de corps : l'objet seul, lu sur la version validée. */
export const scheduledMessageSendItemSchema = z.object({
  id: z.string().guid(),
  versionId: z.string().guid(),
  contactId: z.string().guid(),
  channel: messageDraftChannelSchema,
  subject: z.string().nullable(),
  scheduledAt: z.string(),
  timeZone: z.string(),
  status: scheduledSendStatusSchema,
  attemptedAt: z.string().nullable(),
  sentAt: z.string().nullable(),
  /** Le message retrouvé dans les éléments envoyés de la boîte : la seule source de « Envoyé le … ». */
  proofSentAt: z.string().nullable(),
  failureCode: z.string().nullable(),
  createdAt: z.string(),
})
export type ScheduledMessageSendItem = z.infer<typeof scheduledMessageSendItemSchema>

type ScheduledSendDisplay =
  | { kind: 'scheduled'; at: string }
  | { kind: 'sent_proven'; at: string }
  | { kind: 'sent_unproven'; at: string | null }
  | { kind: 'unknown'; at: string | null }
  | { kind: 'cancelled'; at: null }
  | { kind: 'failed'; at: null; failureCode: string | null }

/** Ce que l'écran a le DROIT de dire d'un envoi programmé : « Envoyé le … » n'existe qu'avec la preuve. */
export function scheduledSendDisplayState(item: ScheduledMessageSendItem): ScheduledSendDisplay {
  switch (item.status) {
    case 'scheduled':
      return { kind: 'scheduled', at: item.scheduledAt }
    case 'sent':
      return item.proofSentAt
        ? { kind: 'sent_proven', at: item.proofSentAt }
        : { kind: 'sent_unproven', at: item.sentAt }
    case 'unknown':
      return { kind: 'unknown', at: item.attemptedAt }
    case 'cancelled':
      return { kind: 'cancelled', at: null }
    case 'failed':
      return { kind: 'failed', at: null, failureCode: item.failureCode }
  }
}

/** Annuler ou déplacer l'heure : seulement tant que l'envoi est programmé ET qu'aucune tentative n'a commencé. */
export function scheduledSendIsChangeable(item: Pick<ScheduledMessageSendItem, 'status' | 'attemptedAt'>): boolean {
  return item.status === 'scheduled' && item.attemptedAt === null
}
