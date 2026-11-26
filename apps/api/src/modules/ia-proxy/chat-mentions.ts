/**
 * #1940.1 — MENTIONNER UN COLLÈGUE prévient réellement le collègue.
 *
 * `Chat.tsx` (`appendMention`) insérait déjà `@Prénom Nom` en texte dans le
 * message — un collègue qui n'avait pas le fil ouvert au même instant ne le
 * voyait jamais. Cette fonction est PURE (aucune I/O) : elle prend le texte
 * déjà écrit et la liste des membres de l'espace, et rend qui a été mentionné,
 * pour que l'appelant (le contrôleur, geste utilisateur — GA-07) décide seul
 * d'écrire une notification.
 *
 * Règles :
 *  - une mention se lit `@Prénom` ou `@Prénom Nom`, au début du texte visé ou
 *    juste après un espace ;
 *  - l'auteur du message ne se notifie jamais lui-même, même s'il se mentionne ;
 *  - la comparaison ignore la casse et les accents ne sont pas normalisés (le
 *    nom mentionné doit être écrit tel qu'affiché ailleurs dans l'app) ;
 *  - un même membre mentionné plusieurs fois n'est rendu qu'une fois.
 */

type ChatMentionMember = {
  userId: string
  fullName: string | null
}

/** Les membres RÉELLEMENT mentionnés dans `content`, sans doublon, sans l'auteur. */
export function resolveChatMentions(
  content: string,
  members: readonly ChatMentionMember[],
  authorUserId: string,
): ChatMentionMember[] {
  const mentionPattern = /@([A-ZÀ-Ý][\wÀ-ÿ'-]*(?:\s[A-ZÀ-Ý][\wÀ-ÿ'-]*)?)/g
  const mentioned = [...content.matchAll(mentionPattern)].map(match => match[1].trim().toLowerCase())
  if (mentioned.length === 0) return []

  const seen = new Set<string>()
  const result: ChatMentionMember[] = []
  for (const member of members) {
    if (member.userId === authorUserId) continue
    if (!member.fullName) continue
    const name = member.fullName.trim().toLowerCase()
    // Une mention "@Prénom" doit matcher le membre "Prénom Nom" (préfixe sur un
    // mot entier), une mention "@Prénom Nom" complète doit matcher exactement.
    const matches = mentioned.some(m => name === m || name.startsWith(`${m} `))
    if (!matches || seen.has(member.userId)) continue
    seen.add(member.userId)
    result.push(member)
  }
  return result
}
