import { z } from 'zod'

/**
 * #4406 — Beeper Desktop, branché par l'utilisateur (Remote Access + son tunnel + OAuth PKCE).
 *
 * Contrat vérifié le 21/10/2026 (developers.beeper.com, `desktop-api-reference/resources/{chats,messages}`) :
 * `GET /v1/chats`, `GET /v1/chats/{chatID}/messages`, `POST /v1/chats/{chatID}/messages`.
 *
 * ⚠️ Les conversations se lisent EN DIRECT : rien de ce qui suit n'est conservé côté Bellum (c96).
 */

/**
 * L'état du branchement, NOMMÉ :
 * - `disconnected` : rien de branché — no-op strict, zéro appel ;
 * - `pending` : URL enregistrée, consentement pas encore rendu ;
 * - `connected` : jeton valide, Beeper a répondu ;
 * - `unreachable` : branché, mais Beeper Desktop fermé ou tunnel coupé — jamais une liste vide.
 */
export const beeperConnectionStateSchema = z.enum(['disconnected', 'pending', 'connected', 'unreachable'])
export type BeeperConnectionState = z.infer<typeof beeperConnectionStateSchema>

export const beeperStatusSchema = z.object({
  /** Le serveur sait-il brancher Beeper (`API_PUBLIC_URL` posé) ? `false` = carte non proposée. */
  configured: z.boolean(),
  state: beeperConnectionStateSchema,
  /** L'adresse saisie (origine seule) — jamais un jeton. */
  baseUrl: z.string().nullable(),
  tunnelDeclared: z.boolean(),
  connectedAt: z.string().nullable(),
})
export type BeeperStatus = z.infer<typeof beeperStatusSchema>

/** L'enregistrement de l'URL distante. `https` obligatoire, sauf tunnel DÉCLARÉ. */
export const beeperRegisterRequestSchema = z.object({
  baseUrl: z.string().trim().min(1).max(2048),
  tunnelDeclared: z.boolean().default(false),
})
export type BeeperRegisterRequest = z.infer<typeof beeperRegisterRequestSchema>

/** Un participant tel que Beeper le rend — coordonnées pro en CLAIR (c87). */
export const beeperParticipantSchema = z.object({
  id: z.string(),
  fullName: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  email: z.string().nullable(),
  username: z.string().nullable(),
  isSelf: z.boolean(),
})
export type BeeperParticipant = z.infer<typeof beeperParticipantSchema>

/** Le contact Bellum reconnu (téléphone / handle / e-mail) — PROPOSÉ, jamais fusionné. */
export const beeperContactMatchSchema = z.object({
  contactId: z.string(),
  fullName: z.string().nullable(),
  accountId: z.string().nullable(),
  matchedOn: z.enum(['phone', 'email', 'handle']),
})
export type BeeperContactMatch = z.infer<typeof beeperContactMatchSchema>

export const beeperConversationSchema = z.object({
  chatId: z.string(),
  /** Le réseau d'origine (WhatsApp, LinkedIn, Signal…), tel que Beeper le nomme. */
  network: z.string().nullable(),
  title: z.string().nullable(),
  type: z.enum(['single', 'group']).nullable(),
  unreadCount: z.number().int().nonnegative().nullable(),
  lastActivity: z.string().nullable(),
  participants: z.array(beeperParticipantSchema),
  contact: beeperContactMatchSchema.nullable(),
})
export type BeeperConversation = z.infer<typeof beeperConversationSchema>

export const beeperConversationsResponseSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('disconnected') }),
  z.object({ state: z.literal('pending') }),
  z.object({ state: z.literal('unreachable'), reason: z.string() }),
  z.object({ state: z.literal('connected'), conversations: z.array(beeperConversationSchema) }),
])
export type BeeperConversationsResponse = z.infer<typeof beeperConversationsResponseSchema>

export const beeperMessageSchema = z.object({
  id: z.string(),
  senderName: z.string().nullable(),
  isSender: z.boolean(),
  timestamp: z.string().nullable(),
  text: z.string().nullable(),
})
export type BeeperMessage = z.infer<typeof beeperMessageSchema>

export const beeperChatMessagesResponseSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('disconnected') }),
  z.object({ state: z.literal('pending') }),
  z.object({ state: z.literal('unreachable'), reason: z.string() }),
  z.object({ state: z.literal('connected'), chatId: z.string(), messages: z.array(beeperMessageSchema) }),
])
export type BeeperChatMessagesResponse = z.infer<typeof beeperChatMessagesResponseSchema>

/**
 * L'envoi d'une réponse — UN GESTE de l'utilisateur, relu à l'écran (porte d'écriture, origine `user`).
 * `idempotencyKey` : un double clic n'envoie pas deux fois.
 */
export const beeperSendRequestSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
  replyToMessageId: z.string().min(1).max(512).optional(),
  idempotencyKey: z.string().guid(),
})
export type BeeperSendRequest = z.infer<typeof beeperSendRequestSchema>

export const beeperSendResultSchema = z.object({
  status: z.enum(['sent', 'already_done']),
  /** L'identifiant provisoire rendu par Beeper — la seule preuve d'envoi qu'il donne. */
  pendingMessageId: z.string().nullable(),
})
export type BeeperSendResult = z.infer<typeof beeperSendResultSchema>
