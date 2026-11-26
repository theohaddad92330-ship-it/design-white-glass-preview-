/**
 * #1914.13 — les initiales d'une personne dans une carte de réponse.
 *
 * Jamais une image : aucune carte ne porte de photo, et une photo n'a rien à
 * faire dans une liste qui ordonne des gens (`c58_criteres_proteges`). Seuls les
 * mots qui commencent par une lettre comptent — « Siège : responsable achats »
 * rend « SR », pas « S: ».
 */
export function personInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(word => /^\p{L}/u.test(word))
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toUpperCase()
}
