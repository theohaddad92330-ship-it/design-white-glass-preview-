import { z } from 'zod'

/**
 * #3086 — PRÉSENCE SUR UN FIL DE LAURA.
 *
 * Apricot Labs (deux sièges, un même espace) : « afficher si une personne est
 * sur une conversation ». Un membre BAT LE COEUR (heartbeat) tant qu'il a le
 * fil ouvert ; l'écran lit ensuite qui d'autre, dans l'espace, en a fait de
 * même récemment. Voir la migration `1796321990410-ChatPresence` — jamais un
 * fait durable, une fenêtre glissante côté service.
 *
 * Même paire `(accountId, conversationId)` que le reste du fil
 * (`chatConversationRefSchema`, `conversation-summary.ts`) : les deux à
 * `undefined`/`null` désignent le fil par défaut de l'appelant.
 */
const accountId = z.string().guid().nullable().optional()
const conversationId = z.string().trim().min(1).max(200).nullable().optional()

export const chatPresenceHeartbeatSchema = z.object({ accountId, conversationId })
export const chatPresenceQuerySchema = z.object({ accountId, conversationId })

/**
 * Un membre présent : prénom + avatar, jamais un identifiant ni un e-mail —
 * même règle que l'auteur d'un message de fil (#1940.4, `WorkspaceAuthor`).
 */
export type ChatPresenceMember = { firstName: string; avatarUrl: string | null }
