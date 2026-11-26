import type { QueryKey } from '@tanstack/react-query'
import { accountKeys } from '@/features/accounts/api'
import { contactKeys } from '../api'

/**
 * Les caches à rafraîchir autour du COMPTE d'un contact — #1473.
 *
 * Depuis que `contacts.account_id` peut valoir `null` (le contact « à
 * qualifier », rencontré sans société connue), six hooks de mutation
 * invalidaient deux clés construites sur un identifiant qui n'existe plus
 * toujours. Invalider `['contacts', 'account', null]` ne planterait pas : ça
 * rafraîchirait une requête que personne ne monte, en silence — et le jour où
 * quelqu'un ajoute un préfixe partagé, ça invaliderait TOUTES les listes par
 * compte à chaque geste sur un contact libre.
 *
 * La liste vide est donc la bonne réponse : sans compte, il n'y a rien à
 * rafraîchir de ce côté. Les clés propres au contact (détail, liste, favoris)
 * restent invalidées par leurs appelants, comme avant.
 *
 * Un seul endroit : six copies de la même garde divergeraient à la première
 * clé ajoutée.
 */
export function contactAccountQueryKeys(accountId: string | null | undefined): QueryKey[] {
  if (!accountId) return []
  return [contactKeys.byAccount(accountId), accountKeys.detail(accountId)]
}
