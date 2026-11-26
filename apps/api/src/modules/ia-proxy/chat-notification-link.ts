/**
 * #1940.1 / #1940.7 — LE LIEN D'UNE NOTIFICATION DE CHAT, À UN SEUL ENDROIT
 * (GA-26).
 *
 * Une mention (#1940.1, `notifyMentions`) et une assignation de carte
 * (#1940.7, `assignPendingAction`) renvoient toutes deux vers LE FIL qui les
 * a produites, avec son compte quand il est connu — jamais un compte deviné.
 * `conversationId` absent (fil non identifié à l'appel) : repli sur le compte
 * seul, puis sur `/chat` nu.
 */
export function chatNotificationLink(target: { conversationId: string | null; accountId: string | null }): string {
  if (target.conversationId) {
    return `/chat?conversationId=${target.conversationId}${target.accountId ? `&accountId=${target.accountId}` : ''}`
  }
  return target.accountId ? `/chat?accountId=${target.accountId}` : '/chat'
}
