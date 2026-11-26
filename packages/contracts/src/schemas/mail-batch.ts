import { z } from 'zod'

/**
 * L'ENVOI DE MASSE GOUVERNÉ — arbitrage Louis du 03/08.
 *
 * Le choix retenu : un lot validé peut PARTIR, pas seulement atterrir en
 * brouillon. C'est plus rapide pour l'utilisateur, et c'est aussi la décision la
 * plus risquée du chantier — un mauvais lot part en entier, et la réputation
 * d'envoi du domaine se répare en semaines. Tout ce contrat existe pour rendre
 * ce risque tenable.
 *
 * Quatre garde-fous, dans l'ordre où ils s'appliquent :
 *
 * 1. **Le lot est PRÉVISUALISÉ intégralement.** L'écran montre chaque message
 *    avant l'approbation ; il n'y a pas de « et 47 autres ».
 * 2. **Le lot est BORNÉ.** Au-delà de {@link MAX_BATCH_RECIPIENTS} destinataires,
 *    la requête est refusée. Une campagne de masse n'est pas une relance
 *    commerciale, et Bellum ne prétend pas être une plateforme d'e-mailing.
 * 3. **L'opt-out est vérifié destinataire par destinataire**, et un désabonné
 *    est ÉCARTÉ du lot avec sa raison — jamais silencieusement inclus.
 * 4. **Le lot est IDEMPOTENT.** `batchId` est fourni par le client et
 *    enregistré : ré-approuver, recharger la page ou rejouer la requête ne
 *    renvoie rien une seconde fois.
 */

/** Au-delà, ce n'est plus une relance : c'est une campagne, et on refuse. */
export const MAX_BATCH_RECIPIENTS = 50

/**
 * Combien d'échecs consécutifs arrêtent le lot.
 *
 * Trois refus d'affilée signalent presque toujours un problème de compte
 * (quota, jeton, blocage fournisseur) et non trois adresses malchanceuses.
 * Continuer, c'est transformer un incident en réputation d'expéditeur abîmée.
 */
export const BATCH_ABORT_AFTER_FAILURES = 3

export const mailBatchModeSchema = z.enum([
  /** Dépose un brouillon par destinataire. Rien ne part. */
  'draft',
  /** Envoie réellement, après approbation du lot (arbitrage Louis du 03/08). */
  'send',
])
export type MailBatchMode = z.infer<typeof mailBatchModeSchema>

export const mailBatchItemSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(300),
  body: z.string().min(1).max(20000),
  /** Répondre dans un fil existant plutôt qu'ouvrir une nouvelle conversation. */
  threadId: z.string().optional(),
})
export type MailBatchItem = z.infer<typeof mailBatchItemSchema>

export const mailBatchRequestSchema = z.object({
  /** Identifiant du lot, choisi par le client. C'est la clé d'idempotence. */
  batchId: z.string().guid(),
  mode: mailBatchModeSchema,
  items: z.array(mailBatchItemSchema).min(1).max(MAX_BATCH_RECIPIENTS),
  /**
   * #4546.5 — la boîte DÉSIGNÉE d'où le lot part, parmi celles du commercial (`GET /mailbox/senders`). Absent : la
   * boîte par défaut d'avant. Jamais un expéditeur deviné : une boîte qui n'est pas la sienne est refusée.
   */
  senderConnectionId: z.string().guid().optional(),
})
export type MailBatchRequest = z.infer<typeof mailBatchRequestSchema>

/** Pourquoi un destinataire a été écarté. Toujours nommée, jamais silencieuse. */
export const mailBatchSkipReasonSchema = z.enum(['suppressed', 'duplicate', 'aborted_after_failures'])
export type MailBatchSkipReason = z.infer<typeof mailBatchSkipReasonSchema>

export const mailBatchOutcomeSchema = z.object({
  to: z.string(),
  status: z.enum(['sent', 'drafted', 'skipped', 'failed']),
  reason: mailBatchSkipReasonSchema.nullable(),
  /** Message d'erreur du fournisseur, quand il y en a un. */
  error: z.string().nullable(),
  /**
   * #3234 — l'identifiant de message que le FOURNISSEUR a rendu à l'envoi
   * (jamais le corps). `null` : le fournisseur n'en rend pas (Graph `sendMail`
   * répond 202 sans corps) — on ne le devine pas. Absent hors envoi confirmé.
   */
  providerMessageId: z.string().nullable().optional(),
  /** #3234 — l'identifiant de fil rendu avec lui, mêmes règles. */
  providerThreadId: z.string().nullable().optional(),
})
export type MailBatchOutcome = z.infer<typeof mailBatchOutcomeSchema>

export const mailBatchResultSchema = z.object({
  batchId: z.string(),
  mode: mailBatchModeSchema,
  /** Vrai quand ce lot avait DÉJÀ été traité : rien n'a été refait. */
  alreadyProcessed: z.boolean(),
  sent: z.number().int().nonnegative(),
  drafted: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  /** Le lot a-t-il été interrompu par la règle des échecs consécutifs ? */
  aborted: z.boolean(),
  outcomes: z.array(mailBatchOutcomeSchema),
})
export type MailBatchResult = z.infer<typeof mailBatchResultSchema>
