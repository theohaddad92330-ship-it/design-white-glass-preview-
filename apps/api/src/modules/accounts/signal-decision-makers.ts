import type { AccountSignalItem } from '@bellum/contracts'

/**
 * #4088.2 — « QUI ÇA CONCERNE » : accroche à chaque signal le décideur de tête de
 * SON compte (le premier du chemin recommandé des contacts — jamais un second
 * classement, GA-26).
 *
 * `heads` n'a une entrée que pour les comptes dont la lecture a abouti : un compte
 * absent de la carte garde ses signaux TELS QUELS (champ absent = « non lu »), un
 * compte présent à `null` porte `decision_maker: null` (« aucun contact
 * classable »). Dans les deux cas, aucun nom n'est inventé.
 */
export function attachDecisionMakers(
  items: AccountSignalItem[],
  heads: ReadonlyMap<string, NonNullable<AccountSignalItem['decision_maker']> | null>,
): AccountSignalItem[] {
  if (heads.size === 0) return items
  return items.map(item =>
    heads.has(item.account_id) ? { ...item, decision_maker: heads.get(item.account_id) } : item,
  )
}
