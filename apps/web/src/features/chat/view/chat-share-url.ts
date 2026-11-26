/**
 * #1953.9 — L'URL DE PARTAGE, À UN SEUL ENDROIT (GA-26).
 *
 * `ShareConversation` partage le FIL ; le bouton de partage sous UNE réponse
 * (`ReplyRetryMenu`) partage la MÊME URL, avec `messageId` en plus — jamais un
 * second calcul de portée. Le fil reste team-scopé côté SERVEUR (voir la
 * doctrine dans `ShareConversation.tsx`) : ce module ne fait que composer
 * l'URL, il ne décide rien.
 */
export function chatShareUrl(
  origin: string,
  params: {
    accountId: string | null
    conversationId: string | null
    messageId: string | null
    /** #2430.4 — une version FIGÉE (lien « SNAPSHOT ») ; absent = le fil vivant (« LIVE »). */
    version?: number | null
  },
): string {
  const url = new URL('/chat', origin)
  if (params.accountId) url.searchParams.set('accountId', params.accountId)
  if (params.conversationId) url.searchParams.set('conversationId', params.conversationId)
  // #1953.9 — un message pas encore enregistré n'a pas d'identifiant : on ne
  // pointe jamais vers une ancre qui n'existera pas à l'ouverture du lien.
  if (params.messageId) url.searchParams.set('messageId', params.messageId)
  if (params.conversationId && params.version) url.searchParams.set('version', String(params.version))
  return url.toString()
}
