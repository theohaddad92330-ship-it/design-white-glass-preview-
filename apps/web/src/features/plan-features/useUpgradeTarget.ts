import { PLAN_FEATURE_KEYS, type PlanFeatureKey } from '@bellum/contracts'
import { usePlans } from '@/features/credits/hooks/usePlans'
import { useCredits } from '@/features/credits/hooks/useCredits'

/** Les paliers vendables, du moins cher au plus cher. L'ordre est celui de la
 *  grille commerciale — le premier qui porte la feature est le moins cher qui la
 *  porte, donc celui qu'on propose. */
const SELF_SERVE_ORDER = ['starter', 'team', 'growth'] as const

type UpgradeTarget = {
  /** Code serveur du palier à prendre (`team`, `growth`…), `null` si aucun ne
   *  porte la feature (grille fermée partout : on ne promet alors rien). */
  planId: string | null
  /** Nom affiché du palier (« Team »), tel que le catalogue le nomme. */
  planName: string | null
  /** Prix mensuel en euros du palier. */
  priceEuros: number | null
  /** Ce que ce palier ouvre EN PLUS de l'offre actuelle — l'argument du passage.
   *  Trié dans l'ordre du contrat, feature demandée en tête. */
  alsoUnlocks: PlanFeatureKey[]
}

/**
 * Quel palier prendre pour obtenir cette feature, et ce qu'il apporte d'autre.
 *
 * Un verrou qui dit seulement « pas inclus » laisse le commercial deviner quelle
 * offre prendre et pourquoi. Celui-ci nomme le palier, son prix, et TOUT ce
 * qu'il débloque en plus de l'offre en cours — c'est la différence entre une
 * porte fermée et une raison de monter.
 *
 * Tout est lu sur le catalogue LIVE (`GET /credits/plans`) : une grille modifiée
 * dans le backoffice change ce que dit l'écran, sans redéploiement. Catalogue
 * indisponible ⇒ `planId: null` et l'écran se contente de dire que ce n'est pas
 * inclus, plutôt que de citer une offre inventée.
 */
export function useUpgradeTarget(feature: PlanFeatureKey): UpgradeTarget {
  const { data: catalog } = usePlans()
  const { data: credits } = useCredits()

  const empty: UpgradeTarget = { planId: null, planName: null, priceEuros: null, alsoUnlocks: [] }
  if (!catalog) return empty

  const target = SELF_SERVE_ORDER.find(key => catalog[key]?.features?.includes(feature))
  if (!target) return empty

  const entry = catalog[target]!
  const current = new Set(credits?.features ?? [])
  return {
    planId: target,
    planName: entry.label || target,
    priceEuros: entry.price / 100,
    // Ce que le palier cible ouvre et que l'offre actuelle n'a pas. La feature
    // demandée passe devant : c'est celle sur laquelle l'utilisateur a buté.
    alsoUnlocks: [feature, ...PLAN_FEATURE_KEYS.filter(key => key !== feature)].filter(
      key => (entry.features ?? []).includes(key) && !current.has(key),
    ),
  }
}
