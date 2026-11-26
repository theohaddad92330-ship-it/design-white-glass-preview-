import type { PlanFeatureKey } from '@bellum/contracts'
import { useCredits } from '@/features/credits/hooks/useCredits'

type PlanFeatureState = {
  /** La liste des features est connue (sinon `allowed` vaut `true` par défaut). */
  known: boolean
  /** La feature est ouverte par l'offre en cours. */
  allowed: boolean
}

/**
 * Ce que l'offre en cours OUVRE, pour verrouiller une surface AVANT le clic.
 *
 * Source : le champ `features` de la charge crédits — la même que le quota et le
 * mode démo. C'est la copie de ce que le serveur applique (`PlanFeatureGuard`) :
 * l'app ne décide rien, elle évite juste de faire cliquer sur ce qui sera refusé.
 *
 * **Le doute n'interdit pas** — même règle que {@link useCreditGate}. Charge en
 * vol, lecture en échec, ou API antérieure au champ ⇒ la surface reste ouverte
 * et c'est le serveur qui tranche. L'inverse afficherait un verrou à des clients
 * qui ont la fonction, sur un simple réseau lent.
 */
/**
 * `null` = « cette surface n'est derrière AUCUN palier » — la réponse est alors
 * connue et ouverte, sans lecture de solde. C'est le cas du lancement d'analyse,
 * dont le type de catalogue porte `feature: null` : sans ce cas, un appelant
 * générique devrait inventer une clé de palier pour poser une question qui n'a
 * pas lieu d'être, et lirait le verrou d'une fonction qu'il ne demande pas.
 */
export function usePlanFeature(feature: PlanFeatureKey | null): PlanFeatureState {
  const { data } = useCredits()
  const features = data?.features
  if (feature === null) return { known: true, allowed: true }
  if (!Array.isArray(features)) return { known: false, allowed: true }
  return { known: true, allowed: features.includes(feature) }
}
