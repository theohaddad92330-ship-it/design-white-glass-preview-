import { foldForNameMatch } from '../contacts/contact-name-match'

/**
 * #2207.31 — les fiches qui POURRAIENT être la même personne, en langage
 * clair pour un lecteur final.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN CONCEPT DÉJÀ RÉEL, JAMAIS ENCORE COMPTÉ EN LOT
 * ─────────────────────────────────────────────────────────────────────────────
 * `contacts.service.ts::createFromCrmPresence` refuse déjà de créer un
 * contact quand PLUSIEURS fiches Bellum répondent au même nom plié dans le
 * même compte (`CreateContactFromCrmResult['status'] === 'ambiguous'`) — mais
 * c'est un contrôle PAR LIGNE, au moment d'une création unitaire, jamais un
 * comptage sur l'ensemble d'une synchronisation. Cette fonction généralise le
 * MÊME critère (`foldForNameMatch`, `contact-name-match.ts` — un seul endroit
 * pour cette règle, GA-26) à un lot : combien de fiches, DANS LE MÊME compte,
 * partagent un nom plié avec au moins une autre.
 *
 * Pure et testée à part : elle ne parle jamais à la base, elle group les
 * lignes qu'on lui donne.
 */
export function countNameAmbiguities(contacts: readonly { account_id: string | null; full_name: string }[]): number {
  const groups = new Map<string, number>()
  for (const contact of contacts) {
    if (!contact.account_id) continue
    const key = `${contact.account_id}::${foldForNameMatch(contact.full_name)}`
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  let ambiguous = 0
  for (const size of groups.values()) {
    if (size > 1) ambiguous += size
  }
  return ambiguous
}
