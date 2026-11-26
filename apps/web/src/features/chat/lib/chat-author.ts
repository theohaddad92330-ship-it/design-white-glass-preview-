import type { ChatMessageAuthor } from '../api/agentChatApi'

/**
 * #1940.4 — QUI A ÉCRIT CETTE BULLE.
 *
 * Deux sources, jamais mélangées :
 *  - une bulle RELUE porte l'auteur servi par l'API (`author`, résolu parmi les
 *    membres de l'espace) — `null` quand il n'y en a pas (compte effacé,
 *    ancien message, personne hors de l'espace) ;
 *  - une bulle tapée dans CET onglet n'a pas encore été relue : elle n'a pas de
 *    champ `author`, et son auteur est la personne connectée.
 *
 * ⚠️ `toChatMessage` pose TOUJOURS le champ sur une bulle relue (au pire à
 * `null`). C'est ce qui empêche un fil servi par une API antérieure au champ
 * d'attribuer les questions d'un collègue à celui qui lit.
 */

type ProfileIdentity = { first_name?: string | null; avatar_url?: string | null; [key: string]: unknown }

/**
 * L'auteur « moi », depuis le profil. Un prénom déclaré ou rien : jamais le
 * début de l'adresse e-mail (`useFirstName` y retombe pour un entête, un
 * auteur ne le fait pas — une bulle signée « theo.martin42 » n'est pas un nom).
 */
export function selfChatAuthor(profile: ProfileIdentity | null | undefined): ChatMessageAuthor | null {
  const firstName = profile?.first_name?.trim()
  if (!firstName) return null
  return { firstName, avatarUrl: safeAvatarUrl(profile?.avatar_url) }
}

/** L'auteur à afficher sur une bulle — voir l'en-tête du fichier. */
export function bubbleAuthor(
  message: { role: 'user' | 'assistant'; author?: ChatMessageAuthor | null },
  self: ChatMessageAuthor | null,
): ChatMessageAuthor | null {
  if (message.role !== 'user') return null
  return message.author === undefined ? self : message.author
}

/** Une adresse https, ou rien : l'avatar finit dans un `src`. Même règle que l'API. */
function safeAvatarUrl(value: string | null | undefined): string | null {
  const url = value?.trim()
  return url && /^https:\/\//i.test(url) ? url : null
}

/**
 * #4016.L3.a — CE TOUR EST-IL LE MIEN ? La réponse de Laura à l'index `index`
 * répond à la dernière bulle d'utilisateur qui la précède ; le tour est le mien
 * quand cette bulle est la mienne : tapée dans cet onglet (pas de champ `author`)
 * ou signée de mon prénom.
 *
 * Dans le doute on se TAIT : auteur non résolu (`null`), pas de bulle avant, ou
 * mon prénom inconnu face à un auteur nommé → `false`. Annoncer à un collègue ce
 * que Laura a lu dans la boîte de quelqu'un d'autre serait pire que ne rien dire.
 */
export function isOwnTurn(
  messages: readonly { role: 'user' | 'assistant'; author?: ChatMessageAuthor | null }[],
  index: number,
  self: ChatMessageAuthor | null,
): boolean {
  for (let i = index - 1; i >= 0; i -= 1) {
    const entry = messages[i]
    if (entry?.role !== 'user') continue
    if (entry.author === undefined) return true
    const firstName = entry.author?.firstName?.trim()
    return Boolean(firstName) && firstName === self?.firstName?.trim()
  }
  return false
}
