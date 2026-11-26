import type { PendingChatAction } from '@bellum/contracts'

/**
 * #3776.6 — « Ouvrir une fiche ou afficher un détail ne nécessite pas une carte
 * « Action à valider » supplémentaire. Une écriture, un envoi, une inscription en campagne
 * ou une opération payante conserve les validations prévues. »
 *
 * Une proposition ne mérite la carte de validation que si son clic CHANGE quelque chose. Seule
 * `open_screen` ne fait que naviguer (voir sa branche de `confirm()`, « aucun appel, aucune
 * écriture »), et seulement SANS coût : un `cost_credits` positif reste une opération payante,
 * donc validée. `prepare_consultant_record` et `push_profile` ouvrent aussi un écran, mais
 * pré-remplissent un formulaire d'écriture — elles gardent leur carte, par prudence.
 */
export function isNavigationOnlyAction(action: PendingChatAction): boolean {
  return action.action === 'open_screen' && !(typeof action.cost_credits === 'number' && action.cost_credits > 0)
}
