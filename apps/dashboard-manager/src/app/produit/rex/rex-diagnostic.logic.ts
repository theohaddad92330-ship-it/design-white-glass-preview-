// #3544.4 — la phrase du marqueur et celle de l'auteur, isolées pour être testées.

/** « texte identique à N autres REX » — `null` quand le REX est unique (aucun marqueur). */
export function marqueurDoublon(identicalTextCount: number): string | null {
  if (identicalTextCount <= 0) return null
  return `texte identique à ${identicalTextCount} ${identicalTextCount === 1 ? 'autre REX' : 'autres REX'}`
}

/**
 * L'auteur d'un REX. `collectedBy` nul (NULL en base, ou id sans profil) se DIT :
 * c'est le signe d'une insertion hors application, jamais un nom deviné.
 */
export const AUCUN_AUTEUR = 'aucun auteur — insertion hors application'

export function nomAuteur(auteur: { firstName: string | null; lastName: string | null } | null): string | null {
  if (!auteur) return null
  const nom = [auteur.firstName, auteur.lastName].filter(Boolean).join(' ').trim()
  return nom || null
}
