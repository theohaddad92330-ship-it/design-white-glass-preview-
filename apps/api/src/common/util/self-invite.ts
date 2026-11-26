/**
 * Ne jamais s'inviter à sa propre réunion.
 *
 * Garde-fou n°15 des méta-analyses besoins (03/08/2026), et l'un des
 * anti-patterns nommément listés : « confusion entre organisateur et
 * participant dans les invitations calendrier ». Le symptôme est discret et
 * durable — l'organisateur reçoit sa propre invitation, son agenda affiche un
 * « en attente de réponse » qu'aucune réponse ne résoudra, et les relances de
 * l'outil de calendrier tournent en boucle.
 *
 * Vit dans `common/util` plutôt que dans un module de capacité parce que les
 * deux agendas (Google, Outlook) l'appliquent, et qu'aucun des deux ne doit
 * dépendre de l'autre pour l'obtenir.
 */
export function dropSelfAttendees(attendees: readonly string[], ownAddress: string | null): string[] {
  const own = ownAddress?.trim().toLowerCase()
  const seen = new Set<string>()
  const kept: string[] = []
  for (const raw of attendees) {
    const entry = raw.trim()
    const lowered = entry.toLowerCase()
    if (!lowered || lowered === own || seen.has(lowered)) continue
    seen.add(lowered)
    kept.push(entry)
  }
  return kept
}
