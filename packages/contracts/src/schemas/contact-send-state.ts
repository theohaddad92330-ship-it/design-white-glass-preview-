import { z } from 'zod'

/**
 * #3699.4/.5 — LE SORT D'UN ENVOI INDIVIDUEL, dit tel qu'on le sait.
 *
 * Avant ce lot l'écran n'avait que deux états (`email_sent_at` posé ou non) et
 * un échec de transport ressemblait à un message perdu alors qu'un délai
 * dépassé peut très bien avoir laissé partir l'e-mail. Les quatre états sont
 * chacun un fait distinguable — aucun n'est deviné :
 * - `claimed` : une tentative est EN COURS (réservée avant d'appeler le
 *   transport : un double clic ou une reprise ne la rejoue pas) ;
 * - `handed_off` : le transport a ACCEPTÉ le message (« pris en charge » pour
 *   l'envoi de l'espace, « envoyé » depuis la boîte connectée). Jamais
 *   « livré » ni « lu » : seul un rebond connu (`email_bounced_at`) s'ajoute ;
 * - `failed` : le transport a REFUSÉ, réponse reçue — rien n'est parti, on peut
 *   renvoyer ;
 * - `uncertain` : la réponse n'est jamais arrivée (délai, coupure) — le message
 *   est peut-être parti. On ne propose PAS de renvoyer avant que la personne ait
 *   vérifié (doctrine : « un timeout n'est pas un échec : `unknown` arrête la
 *   reprise »).
 *
 * `NULL` en base = aucune tentative enregistrée (lignes d'avant ce lot, jamais
 * rétro-calculées). Contrainte SQL : `contacts_email_send_state_check`.
 */
export const CONTACT_SEND_STATES = ['claimed', 'handed_off', 'failed', 'uncertain'] as const
export const contactSendStateSchema = z.enum(CONTACT_SEND_STATES)
export type ContactSendState = z.infer<typeof contactSendStateSchema>

/**
 * Par où part un envoi individuel : l'expéditeur de l'ESPACE (marque + reply-to
 * du commercial) ou la boîte CONNECTÉE du commercial. Choix EXPLICITE quand la
 * boîte est connectée : jamais de bascule silencieuse de l'une à l'autre.
 * Contrainte SQL : `contacts_email_send_channel_check`.
 */
export const CONTACT_SEND_CHANNELS = ['workspace', 'mailbox'] as const
export const contactSendChannelSchema = z.enum(CONTACT_SEND_CHANNELS)
export type ContactSendChannel = z.infer<typeof contactSendChannelSchema>

/** Une tentative `claimed` plus vieille que ça n'est plus « en cours » : le
 *  processus a pu mourir entre la réservation et la réponse — elle est incertaine. */
export const CONTACT_SEND_CLAIM_STALE_MS = 2 * 60 * 1000

/**
 * L'état EFFECTIF d'un envoi : une réservation périmée se lit `uncertain`, un
 * état absent avec `email_sent_at` posé se lit `handed_off` (lignes d'avant ce
 * lot : le transport avait accepté, c'est tout ce qu'on sait).
 */
export function effectiveContactSendState(
  contact: {
    email_send_state?: string | null
    email_send_attempted_at?: Date | string | null
    email_sent_at?: Date | string | null
  },
  now: Date = new Date(),
): ContactSendState | null {
  const state = contact.email_send_state
  if (state === 'claimed') {
    const at = contact.email_send_attempted_at ? new Date(contact.email_send_attempted_at).getTime() : Number.NaN
    return Number.isNaN(at) || now.getTime() - at > CONTACT_SEND_CLAIM_STALE_MS ? 'uncertain' : 'claimed'
  }
  if (state === 'handed_off' || state === 'failed' || state === 'uncertain') return state
  return contact.email_sent_at ? 'handed_off' : null
}

/** `POST /contacts/:id/send-resolution` — la personne a VÉRIFIÉ sa boîte d'envoi. */
export const sendResolutionSchema = z.object({
  /** `not_sent` : rien n'est parti, on peut renvoyer. `sent` : le message y est — déclaratif, jamais une preuve. */
  outcome: z.enum(['not_sent', 'sent']),
})
export type SendResolution = z.infer<typeof sendResolutionSchema>

/** `POST /contacts/:id/declare-sent` (#4418.1) — « Marquer envoyé » : le commercial a envoyé LUI-MÊME, déclaratif, jamais une preuve. */
export const declareSentSchema = z.object({
  channel: z.enum(['email', 'linkedin']),
  /** Le jour où le commercial dit avoir envoyé (AAAA-MM-JJ) : déclaratif, ancre la cadence. Absent = le jour du geste. */
  sent_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
})
