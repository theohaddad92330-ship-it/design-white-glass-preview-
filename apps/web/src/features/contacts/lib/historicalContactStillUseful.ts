import type { Contact } from '@bellum/contracts'

export type HistoricalContactUse = 'dormant_network' | 'account_history' | 'potential_source'

/**
 * #2296.23/.25/.26 (LAU-FINAL-037, épopée #2964) — « une ancienne relation
 * reste utile comme réseau dormant, historique du compte, source
 * d'information potentielle. Elle ne reste pas contact actuel du compte. »
 * Le dernier point est déjà appliqué ailleurs (#2296.27,
 * `contact-eligibility.ts` — exclu EN PORTE du classement) ; ce module NOMME
 * seulement ce que la relation reste, il ne touche à aucun classement.
 *
 * La « nouvelle porte sur le nouvel employeur » (#2296.24) vit séparément
 * (`project.ts` access_mode, I-45) — un fait DIFFÉRENT, jamais redupliqué ici
 * (GA-26).
 *
 * Les trois usages sont un fait CONSTANT de l'état `historique`
 * (`computeContactLifecycleState`), jamais une mesure par contact : aucune
 * donnée n'est inventée en les nommant, et rien n'est affiché pour un
 * contact qui n'est pas dans cet état (GA-18/19 — non mesuré n'est jamais 0).
 */
export function historicalContactStillUsefulAs(
  contact: Pick<Contact, 'lifecycle_state'>,
): HistoricalContactUse[] | null {
  if (contact.lifecycle_state !== 'historique') return null
  return ['dormant_network', 'account_history', 'potential_source']
}
