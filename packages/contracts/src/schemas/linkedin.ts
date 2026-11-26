import { z } from 'zod'

/**
 * LinkedIn SANS scraping (§5.10 du rapport besoins, décision Louis du 03/08).
 *
 * Le scraping reste refusé — violation des CGU, et c'est le compte de
 * l'utilisateur qui serait banni, pas le nôtre. Ce qui suit ne demande aucun
 * accès à LinkedIn : le commercial déclare ce qu'il a fait, Bellum s'en souvient
 * et le relance au bon moment.
 *
 * Le résultat est le même que ce que le rapport demande — « suivre les connexions
 * acceptées », « enregistrer les interactions dans le CRM » — par un chemin qui
 * n'expose personne.
 */

export const linkedinInteractionKindSchema = z.enum([
  /** Invitation envoyée. */
  'connection_sent',
  /** Invitation acceptée — le point de départ du délai de relance. */
  'connection_accepted',
  /** Message envoyé. */
  'message_sent',
  /** Réponse reçue : ce qui ARRÊTE la relance. */
  'reply_received',
  /** Interaction sur une publication (commentaire, réaction). */
  'post_engagement',
])

export type LinkedInInteractionKind = z.infer<typeof linkedinInteractionKindSchema>

export const linkedinInteractionSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  kind: linkedinInteractionKindSchema,
  occurredAt: z.string(),
  note: z.string().nullable(),
})

export type LinkedInInteraction = z.infer<typeof linkedinInteractionSchema>

/** Une connexion acceptée restée sans réponse au-delà du délai. */
export const linkedinFollowUpSchema = z.object({
  contactId: z.string(),
  contactName: z.string().nullable(),
  acceptedAt: z.string(),
  daysSinceAccepted: z.number().int().nonnegative(),
})

export type LinkedInFollowUp = z.infer<typeof linkedinFollowUpSchema>

/** Un sujet de publication. On propose l'angle, pas le texte. */
export const postIdeaSchema = z.object({
  angle: z.string(),
  whyNow: z.string(),
  openingLine: z.string(),
  /** Ce sur quoi l'angle s'appuie, cité tel quel. Un sujet sans ancrage est écarté. */
  groundedOn: z.string(),
})

export type PostIdea = z.infer<typeof postIdeaSchema>

/**
 * #4737 — l'issue d'un geste d'envoi sous mandat. `unknown` est un TIMEOUT : il
 * n'est pas un échec et arrête la reprise. `sent` est le seul statut qui porte
 * une preuve du fournisseur ; `not_open` dit que la voie officielle n'est pas
 * ouverte (aucun agrément partenaire).
 */
export const linkedinSendStatusSchema = z.enum(['refused', 'not_open', 'sent', 'failed', 'unknown'])
export type LinkedInSendStatus = z.infer<typeof linkedinSendStatusSchema>

/**
 * #4737 K2 — ce que l'écran lit du mandat d'envoi LinkedIn. AUCUN champ pour le corps du message,
 * aucun pour les identifiants du client : ils n'existent pas dans ces formes.
 */
export const linkedinMandateViewSchema = z.object({
  id: z.string(),
  grantedAt: z.string(),
  validFrom: z.string(),
  validUntil: z.string(),
  dailyLimit: z.number().int(),
  revokedAt: z.string().nullable(),
  /** Valide à l'instant de la lecture : ni révoqué, ni hors période. */
  active: z.boolean(),
})
export type LinkedInMandateView = z.infer<typeof linkedinMandateViewSchema>

export const linkedinSendStatusViewSchema = z.object({
  mandate: linkedinMandateViewSchema.nullable(),
  dailyLimit: z.number().int(),
  sentToday: z.number().int(),
  /** 0 sans mandat actif : rien ne peut partir. */
  remainingToday: z.number().int(),
  /** Faux tant que la clé fournisseur est absente ou que le compte du client n'est pas relié. */
  routeOpen: z.boolean(),
})
export type LinkedInSendStatusView = z.infer<typeof linkedinSendStatusViewSchema>

export const linkedinSendRefusalSchema = z.enum([
  'no_mandate',
  'revoked',
  'not_yet_valid',
  'expired',
  'recipient_replied',
  'previous_unknown',
  'daily_limit_reached',
  'demo',
])
export type LinkedInSendRefusal = z.infer<typeof linkedinSendRefusalSchema>

export const linkedinSendViewSchema = z.object({
  id: z.string(),
  status: linkedinSendStatusSchema,
  reason: linkedinSendRefusalSchema.nullable(),
  /** Vrai seulement pour un envoi dont le fournisseur a rendu une preuve. */
  proofVerified: z.boolean(),
  createdAt: z.string(),
})
export type LinkedInSendView = z.infer<typeof linkedinSendViewSchema>
