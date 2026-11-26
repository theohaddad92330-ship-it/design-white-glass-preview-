/**
 * #2202.19 / #2202.22 — AVANT VALIDATION : DOUBLONS ET DÉJÀ EN SÉQUENCE.
 *
 * Deux vérifications distinctes que `CreateSequenceDialog` ne faisait pas
 * avant de valider : deux fiches sélectionnées peuvent porter la MÊME adresse
 * e-mail (deux enregistrements pour une seule personne réelle), et une
 * personne sélectionnée peut déjà avoir une séquence en cours. Ni l'une ni
 * l'autre ne bloque le clic « Créer » — informer, pas décider à la place du
 * commercial (doctrine « on PROPOSE, on ne décide jamais à sa place »).
 *
 * Deux fonctions PURES, séparées de l'écran : la même discipline que
 * `no-email-confirmation.ts` — l'écran ne fait qu'appeler et afficher.
 */

type ContactWithEmail = { id: string; email: string | null }

/**
 * Les contacts de la sélection qui partagent une adresse e-mail avec au moins
 * un autre contact sélectionné — comparée sans casse ni espace de bord, deux
 * saisies « Claire@Example.com » et « claire@example.com » désignant la même
 * boîte. Un contact SANS e-mail ne fait jamais doublon avec un autre (GA-18 :
 * une absence n'est pas une valeur qui peut se répéter).
 */
export function duplicateEmailContacts<T extends ContactWithEmail>(chosen: readonly T[]): T[] {
  const counts = new Map<string, number>()
  const normalized = (email: string) => email.trim().toLowerCase()
  for (const contact of chosen) {
    if (!contact.email) continue
    const key = normalized(contact.email)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return chosen.filter(contact => contact.email && (counts.get(normalized(contact.email)) ?? 0) > 1)
}

type SequenceLookup = { contact_id: string; status: 'active' | 'paused' | 'completed' | 'cancelled' }

/**
 * Les identifiants, parmi la sélection courante, qui portent déjà une
 * séquence ACTIVE ou EN PAUSE — jamais une séquence terminée ou annulée, qui
 * n'engage plus personne.
 *
 * ⚠️ `sequences` à `undefined` (page pas encore chargée) rend un tableau vide :
 * ne rien affirmer tant qu'on ne sait pas, plutôt qu'un faux « aucune » (même
 * discipline que `ownedByColleague` sur `useWorkspaceMembers`, GA-18/GA-19).
 */
export function contactsAlreadyInSequence(
  chosen: readonly { id: string }[],
  sequences: readonly SequenceLookup[] | undefined,
): string[] {
  if (!sequences) return []
  const alreadyIds = new Set(
    sequences.filter(sequence => sequence.status === 'active' || sequence.status === 'paused').map(s => s.contact_id),
  )
  return chosen.filter(contact => alreadyIds.has(contact.id)).map(contact => contact.id)
}

const normalizedName = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ')

/**
 * #3701.8 — LES HOMONYMES DE LA SÉLECTION, par groupes, jamais fusionnés.
 *
 * Deux fiches au même nom peuvent être une même personne (doublon) ou deux
 * personnes. On ne le décide pas : on PROPOSE (doctrine « on ne fusionne
 * JAMAIS »), en groupant les fiches pour que le commercial voie, et la
 * séquence reste une par fiche. Nom comparé sans accent ni casse ; une fiche
 * sans nom ne fait jamais homonyme (GA-18 : une absence ne se répète pas).
 */
export function homonymContacts<T extends { id: string; full_name: string }>(chosen: readonly T[]): T[][] {
  const groups = new Map<string, T[]>()
  for (const contact of chosen) {
    const key = normalizedName(contact.full_name)
    if (!key) continue
    groups.set(key, [...(groups.get(key) ?? []), contact])
  }
  return [...groups.values()].filter(group => group.length > 1)
}
