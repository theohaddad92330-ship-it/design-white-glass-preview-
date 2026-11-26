import { z } from 'zod'
import { entryStrategySchema, type EntryStrategy } from './profile-context.js'

/**
 * #2430 — L'OBJET CONVERSATION de Laura (décision de Louis, 22/09/2026 soir,
 * decisions §10) : ce qu'un fil NOMMÉ porte au-delà de ses messages.
 *
 * Il ÉTEND le fil, il ne le remplace pas : une conversation reste sa clé
 * (`chat_messages.conversation_id`) et ses lignes. Tables
 * `chat_conversations` / `chat_conversation_versions`, migration
 * `1795999431572-ChatConversations`.
 */

/** #2430.4 / #2430.11 — une version FIGÉE : une borne sur le même fil, jamais une copie. */
export type ChatConversationVersion = {
  version: number
  upToMessageId: string
  upToAt: string
  createdBy: string | null
  createdAt: string
}

/** Ce que `GET /ia/chat/conversations/detail` rend. */
export type ChatConversationDetail = {
  conversationId: string
  /** `null` = personne à nommer (fil vide, ou compte effacé — RGPD). */
  ownerUserId: string | null
  /** #2430.12 — d'où vient le propriétaire : déclaré (transféré, branche) ou qui a ouvert le fil. */
  ownerSource: 'declared' | 'opener'
  /** #2430.2 — le fil dont celui-ci est une branche. */
  parentConversationId: string | null
  branchedFromMessageId: string | null
  /** #2430.12 — le compte auquel la conversation est rattachée. */
  attachedAccountId: string | null
  /**
   * #2075.29 / #2075.30 — CE QUE L'AUDIT DISAIT à l'ouverture du fil depuis
   * lui (« Demander à… ») : version, stratégie choisie, premiers mouvements
   * proposés, et les INCONNUES (`AuditUnestablished`, ce qui n'a pas pu être
   * établi). `null` = ce fil ne vient pas de l'audit. Posé UNE FOIS
   * (`attachAuditSnapshot`), jamais réécrit par une régénération ultérieure —
   * lire l'audit COURANT depuis la conversation raconterait un audit qui a
   * changé depuis, jamais celui qui a ouvert le fil.
   */
  auditSnapshot: ChatConversationAuditSnapshot | null
  /**
   * #2430.10 / #2439.13 — conservation légale en cours, ou `null`. `reason` est
   * OBLIGATOIRE dès la pose (`chatConversationLegalHoldSchema`) : une
   * conservation qui n'explique pas pourquoi n'est qu'un blocage muet — la
   * doctrine du centre données exige « expliquer pourquoi » avant tout.
   *
   * `reviewBy` — #2439.13 (délai/expiration) — OPTIONNEL, DÉCLARÉ par le
   * gérant qui pose la conservation, jamais calculé ici : la durée d'une
   * conservation légale dépend du litige ou de l'obligation qui la motive,
   * une donnée que Bellum n'a aucun moyen de connaître. `null` = aucune date
   * de revue posée, la conservation reste tant qu'elle n'est pas levée à la
   * main — comportement inchangé.
   */
  legalHold: { since: string; by: string | null; reason: string; reviewBy: string | null } | null
  versions: ChatConversationVersion[]
}

// La clé libre du fil (`chat_messages.conversation_id` est TEXT depuis 1786500000000).
const conversationId = z.string().min(1).max(200)

export const chatConversationRefSchema = z.object({ conversationId })

/** #2430.2 — explorer une autre hypothèse dans un fil NEUF, relié à son origine. */
export const chatConversationBranchSchema = z.object({
  fromConversationId: conversationId,
  fromMessageId: z.string().guid().nullable().optional(),
})

/** #2430.12 — transférer la conversation à un autre membre de l'espace. */
export const chatConversationOwnerSchema = z.object({ conversationId, ownerUserId: z.string().guid() })

/** #2430.12 — rattacher (ou détacher, `null`) la conversation à un compte. */
export const chatConversationAttachSchema = z.object({ conversationId, accountId: z.string().guid().nullable() })

/**
 * #2075.29 / #2075.30 — la forme figée du snapshot audit. `firstActions` reprend
 * les libellés déjà RENDUS des mouvements proposés (`AuditFirstMoves`, au plus
 * trois, un par genre) ; `unknowns` reprend les raisons déjà RENDUES de ce qui
 * n'a pas pu être établi (`AuditUnestablished` / `unestablishedReasonText`) —
 * du texte déjà traduit côté écran, jamais une seconde dérivation côté serveur
 * (GA-26) : le serveur transporte, il ne recalcule pas.
 */
export type ChatConversationAuditSnapshot = {
  auditVersion: number | null
  strategy: EntryStrategy | null
  firstActions: string[]
  unknowns: string[]
  takenAt: string
}

/** #2075.29 / #2075.30 — poser le snapshot audit, une fois, à l'ouverture du fil. */
export const chatConversationAuditSnapshotSchema = z.object({
  conversationId,
  auditVersion: z.number().nullable(),
  strategy: entryStrategySchema.nullable(),
  firstActions: z.array(z.string().min(1).max(300)).max(3),
  unknowns: z.array(z.string().min(1).max(300)).max(12),
})

/**
 * #2430.10 / #2439.13 — poser ou lever la conservation légale.
 *
 * `reason` est REQUIS pour poser (`hold: true`) — expliquer pourquoi est la
 * première exigence du centre données sur une donnée non supprimable
 * immédiatement (#2439.13) — et ignoré pour lever (`hold: false`) : lever
 * n'a rien à justifier, c'est poser qui doit l'être.
 */
export const chatConversationLegalHoldSchema = z
  .object({
    conversationId,
    hold: z.boolean(),
    reason: z.string().trim().min(1).max(500).optional(),
    // #2439.13 — la date de revue, OPTIONNELLE et DÉCLARÉE par qui pose la
    // conservation (voir `ChatConversationDetail.legalHold.reviewBy`) —
    // jamais devinée. Ignorée pour lever, même règle que `reason`.
    reviewBy: z.string().datetime().optional(),
  })
  .refine(value => !value.hold || Boolean(value.reason?.trim()), {
    message: 'Une conservation légale doit dire pourquoi.',
    path: ['reason'],
  })

/**
 * #2439.13 — CALCUL PUR : une conservation légale a-t-elle dépassé sa date de
 * revue ? `reviewBy` `null` (aucune date posée) n'est jamais « en retard » —
 * l'absence d'une date n'est pas une date passée.
 */
export function isLegalHoldReviewOverdue(reviewBy: string | null, now: Date = new Date()): boolean {
  if (!reviewBy) return false
  return new Date(reviewBy).getTime() <= now.getTime()
}
