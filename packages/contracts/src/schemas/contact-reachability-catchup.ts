/**
 * #3549 (02/10/2026) — LE RATTRAPAGE DES COORDONNÉES MANQUANTES.
 *
 * Doctrine « un correctif de collecte RATTRAPE l'existant » : la cascade
 * d'enrichissement a été corrigée (#3022, #3549) ; les contacts déjà enrichis
 * AVANT ce correctif et restés sans e-mail ou sans téléphone n'en profitent que
 * si on les rejoue. Ciblé (jamais tout le parc), par SEGMENT (les contacts
 * seuls), décidé sur une DATE — la dernière tentative contre la date de la
 * capacité — jamais sur un symptôme seul. GRATUIT pour le client (comme les six
 * segments de `segment-catchup.ts`), et JAMAIS lancé au déploiement : seul un
 * appel d'opérateur explicite l'atteint.
 *
 * Aucune colonne de marquage : le rejeu écrit sa propre trace
 * (`last_enrichment_at`), qui dépasse alors la date de la capacité — le contact
 * sort tout seul du ciblage.
 */

/** La date de LA CAPACITÉ — quand la cascade corrigée est partie en production. */
export const CONTACT_REACHABILITY_CATCHUP_CAPABILITY_AT = '2026-10-02T12:00:00.000Z'

type ReachabilityCatchupInput = {
  email?: string | null
  phone?: string | null
  last_enrichment_at?: Date | string | null
  created_at?: Date | string | null
}

const present = (value: string | null | undefined): boolean => (value ?? '').trim() !== ''

const timeOf = (value: Date | string | null | undefined): number | null => {
  if (!value) return null
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? null : t
}

/**
 * Un contact est CONCERNÉ quand il manque un e-mail ou un téléphone ET que sa
 * dernière collecte précède la capacité. Un contact jamais enrichi se date par
 * sa création : il n'a pas de tentative, mais une date de collecte tout de même.
 * Date illisible ⇒ non concerné : on ne rejoue pas sur une date qu'on ne sait pas lire.
 */
export function isContactReachabilityCatchupConcerned(
  contact: ReachabilityCatchupInput,
  capabilityAt: string = CONTACT_REACHABILITY_CATCHUP_CAPABILITY_AT,
): boolean {
  if (present(contact.email) && present(contact.phone)) return false
  const collectedAt = timeOf(contact.last_enrichment_at) ?? timeOf(contact.created_at)
  const capability = timeOf(capabilityAt)
  if (collectedAt === null || capability === null) return false
  return collectedAt < capability
}

/** La coordonnée à demander : celle qui manque seule, sinon les deux (`null`). */
export function contactReachabilityCatchupOnly(contact: {
  email?: string | null
  phone?: string | null
}): 'email' | 'phone' | null {
  const hasEmail = present(contact.email)
  const hasPhone = present(contact.phone)
  if (hasEmail && !hasPhone) return 'phone'
  if (!hasEmail && hasPhone) return 'email'
  return null
}

export type ContactReachabilityCatchupOutcome = {
  /** Contacts CONCERNÉS trouvés ce passage — jamais tout le parc, borné par `limit`. */
  scanned: number
  /** Jobs d'enrichissement mis en file (un par contact). */
  enqueued: number
  /** Refusés d'avance (cooldown, contact sans compte…) — comptés à part, jamais perdus. */
  skipped: number
  /** L'interrupteur d'arrêt a coupé la course : rien n'a été exécuté. */
  cut: boolean
}
