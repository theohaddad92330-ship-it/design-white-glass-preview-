import type { Account } from '@bellum/contracts'
import { heroPrimaryAction, heroPrimaryActionInput } from './heroPrimaryAction'
import { useAccountNextMeeting } from './useAccountNextMeeting'

/**
 * #2117.6, .25-30 — LE BRANCHEMENT de la décision pure sur le compte affiché.
 *
 * `heroPrimaryAction` est une fonction pure, et le reste : c'est ce qui permet
 * de montrer ses cinq états un à un sans monter un écran. Ce hook est l'unique
 * endroit qui lui apporte ses entrées (le compte, et l'agenda pour savoir si un
 * rendez-vous est posé).
 *
 * ⚠ Il existe parce que DEUX composants rendent maintenant un morceau de cette
 * décision — le geste principal (`AccountDetailHeroPrimaryAction`) et la phrase
 * qui NOMME la prochaine action (`AccountDetailHeroNextAction`), séparés par le
 * correctif du hero écrasé. Recopier les deux lignes de branchement dans chacun
 * aurait fait deux chemins qui divergent : le jour où l'un gagne une entrée, le
 * hero dirait deux choses différentes sur le même compte.
 *
 * Aucun appel réseau n'est dédoublé par cette séparation : `useAccountNextMeeting`
 * lit une requête React Query dont la clé est partagée, donc les deux appelants
 * lisent la MÊME réponse.
 */
export function useHeroPrimaryAction(account: Account) {
  const meeting = useAccountNextMeeting(account)
  return heroPrimaryAction(heroPrimaryActionInput(account, meeting !== null))
}
