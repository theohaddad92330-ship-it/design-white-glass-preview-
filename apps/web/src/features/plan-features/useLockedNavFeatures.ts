import { PLAN_FEATURE_KEYS, type PlanFeatureKey } from '@bellum/contracts'
import { useCredits } from '@/features/credits/hooks/useCredits'

/**
 * Les features que l'offre en cours n'ouvre PAS — pour marquer d'un cadenas les
 * entrées de navigation concernées.
 *
 * Un seul appel pour toute la barre latérale : `usePlanFeature` par entrée
 * multiplierait la même lecture sans rien apporter.
 *
 * Même règle que partout ailleurs : **le doute n'interdit pas**. Charge en vol,
 * lecture en échec ou API antérieure au champ ⇒ ensemble VIDE, donc aucune
 * entrée verrouillée. Un cadenas affiché à tort sur un client qui a la fonction
 * coûte plus cher qu'un cadenas manquant une seconde.
 */
export function useLockedNavFeatures(): ReadonlySet<PlanFeatureKey> {
  const { data } = useCredits()
  const features = data?.features
  if (!Array.isArray(features)) return new Set()
  return new Set(PLAN_FEATURE_KEYS.filter(key => !features.includes(key)))
}

/**
 * Faut-il MASQUER les entrées verrouillées, plutôt que de les afficher avec un
 * cadenas ? (recette finale §12, arbitrage Louis du 02/08)
 *
 * Le rapport le note sur la capture d'un compte neuf : « Les modules verrouillés
 * sont visibles avant que le produit ait prouvé sa compréhension et sa valeur. »
 * Trois cadenas dans la barre latérale d'un utilisateur qui n'a pas encore vu un
 * seul dossier, ce n'est pas une incitation — c'est du bruit, et ça donne
 * l'impression d'un produit dont on n'a acheté qu'un morceau avant même de
 * l'avoir essayé.
 *
 * La bascule est la PREMIÈRE ANALYSE, pas une date ni un nombre de connexions :
 * c'est le moment où l'utilisateur a vu ce que le produit sait faire, donc le
 * premier moment où « voici ce que l'offre supérieure ajoute » veut dire quelque
 * chose pour lui.
 *
 * Lecture indisponible ⇒ on masque. Le pire cas honnête : afficher trois
 * cadenas à quelqu'un dont on ne sait rien est précisément ce qu'on corrige.
 */
export function useHideLockedNav(): boolean {
  const { data } = useCredits()
  const used = data?.accounts_used
  return typeof used !== 'number' || used <= 0
}
