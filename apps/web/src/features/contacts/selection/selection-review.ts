import { homonymContacts } from '@/features/outreach/audience-validation'

type ReviewableContact = {
  id: string
  full_name: string
  email?: string | null
  excluded_at?: string | null
}

/**
 * #3701.3 / #3701.8 — LA REVUE D'UNE SÉLECTION, avant de la traiter.
 *
 * Pure : l'écran n'a qu'à afficher. Chaque cas est NOMMÉ à part et rien n'est
 * retiré en silence — la revue montre, c'est le commercial qui décide.
 *  - `excluded` : la personne s'est désinscrite (`excluded_at`) ; elle ne
 *    recevra rien de la part du produit, et c'est dit.
 *  - `withoutEmail` : une fiche exclue n'y figure pas (un seul motif par fiche).
 *  - `homonymGroups` : mêmes noms, fiches distinctes — jamais fusionnées.
 */
export function reviewSelection<T extends ReviewableContact>(chosen: readonly T[]) {
  const excluded = chosen.filter(contact => Boolean(contact.excluded_at))
  const withoutEmail = chosen.filter(contact => !contact.excluded_at && !contact.email)
  return {
    total: chosen.length,
    excluded,
    withoutEmail,
    homonymGroups: homonymContacts(chosen),
  }
}
