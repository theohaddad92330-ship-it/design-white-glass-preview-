import type { MailMessage } from '@bellum/contracts'

/**
 * #4016 L3 (décision Louis 11/10/2026, `c96_corps_mails_boite_du_commercial`) —
 * le CORPS d'un fil de la boîte DU COMMERCIAL, lu pour lui seul par Laura.
 *
 * Trois bornes tiennent la règle, et elles vivent ICI plutôt que dans l'appelant :
 *  - la boîte lue est celle de l'utilisateur authentifié (le jeton du backend est
 *    le sien : on ne peut pas atteindre la boîte d'un collègue par ce chemin) ;
 *  - le texte est BORNÉ (nombre de messages, taille de chacun) ;
 *  - rien n'est conservé : ni base, ni journal, ni cache — le corps vit le temps de
 *    la réponse.
 */
export const MAIL_THREAD_MAX_MESSAGES = 6
export const MAIL_THREAD_MAX_CHARS = 4_000
/** Fenêtre par défaut quand l'appelant n'en donne pas : un fil récent, pas l'archive. */
export const MAIL_THREAD_DEFAULT_WINDOW_DAYS = 90

export type MailThreadTextMessage = {
  direction: MailMessage['direction']
  date: string | null
  from: string | null
  text: string
}

export type MailThreadText = {
  threadId: string
  subject: string | null
  messages: MailThreadTextMessage[]
  /** Des messages plus anciens existent dans le fil mais ne sont pas rendus. */
  truncated: boolean
}

/**
 * Les messages du fil demandé, du plus ancien au plus récent, bornés aux derniers.
 * Un message d'un AUTRE fil n'est jamais retenu (une recherche par interlocuteur
 * en remonte plusieurs).
 */
export function pickThreadMessages(
  messages: readonly MailMessage[],
  threadId: string,
  max: number = MAIL_THREAD_MAX_MESSAGES,
): { picked: MailMessage[]; truncated: boolean } {
  const inThread = messages
    .filter(message => message.threadId === threadId)
    .sort((a, b) => Date.parse(a.date ?? '') - Date.parse(b.date ?? '') || 0)
  const picked = inThread.slice(-max)
  return { picked, truncated: inThread.length > picked.length }
}
