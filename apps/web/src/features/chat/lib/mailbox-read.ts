import type { ChatMessageAuthor } from '../api/agentChatApi'
import { isOwnTurn } from './chat-author'

/** L'outil de Laura qui lit un fil de LA boîte du commercial qui la sollicite (c96). */
export const READ_MAIL_THREAD_TOOL = 'read_mail_thread'

type TurnMessage = {
  role: 'user' | 'assistant'
  author?: ChatMessageAuthor | null
  context?: { reasoning_trace?: { tools_called?: readonly string[] | null } | null } | null
}

/**
 * #5032.9 — LAURA A-T-ELLE LU UN FIL DE MA MESSAGERIE DANS CETTE CONVERSATION ?
 *
 * Alimente la ligne du panneau latéral (⋯ › Conversation). Mêmes règles que la
 * ligne du panneau Sources : seul l'AUTEUR du tour la voit (c'est SA boîte qui a
 * été lue) et, dans le doute, on se tait (`isOwnTurn`). Sans trace de lecture :
 * `false`, jamais une ligne « 0 ».
 */
export function threadMailboxRead(messages: readonly TurnMessage[], self: ChatMessageAuthor | null): boolean {
  return messages.some(
    (message, index) =>
      message.role === 'assistant' &&
      message.context?.reasoning_trace?.tools_called?.includes(READ_MAIL_THREAD_TOOL) === true &&
      isOwnTurn(messages, index, self),
  )
}
