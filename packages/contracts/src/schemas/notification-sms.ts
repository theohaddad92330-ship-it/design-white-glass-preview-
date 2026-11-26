import { z } from 'zod'

/**
 * LE CANAL SMS DES ALERTES URGENTES — #1938.4, décision Louis 13/09 batch 13
 * (prise contre la recommandation du 12/09, qui écartait le SMS).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE CONTRAT PROMET, ET CE QU'IL NE PROMET PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucun fournisseur n'est choisi. « Un contrat d'API non vérifiable ne se devine
 * pas » : l'API expose un PORT d'envoi et une implémentation qui ne sait rien
 * envoyer, et tant qu'il en est ainsi le canal rend `status: 'coming_soon'` —
 * aucun numéro ne s'enregistre, aucun SMS ne part, aucun appel réseau n'a lieu.
 *
 * Le consentement est explicite, et ce fichier en porte les deux bornes :
 *  - un numéro n'entre QUE par une demande de code (`startSmsVerificationSchema`),
 *    et seul un numéro vérifié peut recevoir une alerte ;
 *  - un type ne se coche jamais par défaut (`smsChannelWithoutNumber`), et le
 *    corps de mise à jour ne porte QUE les types — ni numéro, ni date de
 *    vérification, ni date de consentement : ceux-là, seul le serveur les écrit.
 */

/**
 * Les types qui PEUVENT partir par SMS : exactement les alertes que la
 * présélection « Urgent uniquement » du lot 7 garde allumées (signal d'achat,
 * crédits bientôt épuisés, actions en retard). Pas un digest, pas un événement
 * système : un SMS interrompt plus qu'une cloche, il ne se mérite que par
 * l'urgence. La parité avec `NOTIFICATION_PRESETS.urgent_only` est tenue par
 * `notification-sms.test.ts`.
 */
export const SMS_NOTIFICATION_TYPES = ['buy_signal', 'credit_low', 'action_overdue'] as const
export type SmsNotificationType = (typeof SMS_NOTIFICATION_TYPES)[number]

export function isSmsNotificationType(type: string): type is SmsNotificationType {
  return (SMS_NOTIFICATION_TYPES as readonly string[]).includes(type)
}

/**
 * Ce que le canal peut faire MAINTENANT, pour cet utilisateur.
 *
 *  - `coming_soon` : aucun fournisseur n'est branché — l'état de la production
 *    tant que Louis n'a pas choisi. Rien ne s'enregistre, rien ne part.
 *  - `paused`      : un fournisseur existe, mais l'interrupteur d'incident
 *    `notifications.sms` est posé. Les choix sont gardés, rien ne part.
 *  - `demo`        : un espace de démonstration — aucun numéro n'y est jamais
 *    enregistré, quel que soit l'état du fournisseur.
 *  - `ready`       : la vérification et les envois sont possibles.
 */
export const SMS_CHANNEL_STATUSES = ['coming_soon', 'paused', 'demo', 'ready'] as const
export type SmsChannelStatus = (typeof SMS_CHANNEL_STATUSES)[number]

/** Un numéro de mobile au format international E.164 (`+` puis 8 à 15 chiffres). */
export const smsPhoneNumberSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/)

const smsTypeOptInsSchema = z.object({
  buy_signal: z.boolean(),
  credit_low: z.boolean(),
  action_overdue: z.boolean(),
})

export const smsChannelSettingsSchema = z.object({
  status: z.enum(SMS_CHANNEL_STATUSES),
  /** Le numéro saisi par la personne — rendu à elle seule, jamais journalisé. */
  phone: z.string().nullable(),
  /** Quand la personne a prouvé qu'elle tient ce numéro. `null` = non vérifié. */
  verified_at: z.string().nullable(),
  /** Un code a été envoyé et attend d'être saisi. */
  verification_pending: z.boolean(),
  /** Le dernier geste de consentement (un type coché). `null` = aucun type coché. */
  consent_at: z.string().nullable(),
  types: smsTypeOptInsSchema,
})
export type SmsChannelSettings = z.infer<typeof smsChannelSettingsSchema>

/** PATCH — les types seuls, chacun optionnel. Les clés inconnues sont retirées. */
export const updateSmsTypeOptInsSchema = smsTypeOptInsSchema.partial()
export type UpdateSmsTypeOptIns = z.infer<typeof updateSmsTypeOptInsSchema>

/** POST — la demande de code : le numéro, et rien d'autre. */
export const startSmsVerificationSchema = z.object({ phone: smsPhoneNumberSchema })

/** POST — la saisie du code reçu. */
export const confirmSmsVerificationSchema = z.object({ code: z.string().regex(/^\d{6}$/) })

/**
 * L'état d'un canal sans numéro enregistré. Aucun type coché — jamais par
 * défaut, et c'est la seule forme qu'un canal prend avant un geste de la
 * personne.
 */
export function smsChannelWithoutNumber(status: SmsChannelStatus): SmsChannelSettings {
  return {
    status,
    phone: null,
    verified_at: null,
    verification_pending: false,
    consent_at: null,
    types: { buy_signal: false, credit_low: false, action_overdue: false },
  }
}
