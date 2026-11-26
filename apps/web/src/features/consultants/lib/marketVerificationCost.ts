import type { LaunchPlan } from '@/features/search/hooks/useLaunchPlan'

/**
 * #2288.4 — LE COÛT ANNONCÉ EST LE COÛT DÉBITÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE SOMME PAR ENTREPRISE, ET PAS « PRIX × NOMBRE »
 * ─────────────────────────────────────────────────────────────────────────────
 * Vérifier aujourd'hui, c'est relancer une analyse. Ce que `start()` débite
 * dépend de l'entreprise : un dossier déjà analysé dans l'espace est ROUVERT
 * sans débit (`cache_hit`), une démonstration ne débite jamais rien, et seul un
 * lancement neuf (`fresh`) coûte. Multiplier un prix de grille par le nombre de
 * candidats annoncerait 8 crédits pour un dossier que le lanceur rouvrira pour
 * 0 — un devis faux, dans le sens inverse du défaut mesuré en production le
 * 18/09/2026 (un axe annoncé à 1 crédit, débité 2), mais faux quand même.
 *
 * La somme est donc faite sur les réponses de `GET /analysis/launch-plan` —
 * `AnalysisService.planLaunch`, qui lit les MÊMES signaux dans le MÊME ordre
 * que `start()` et prend son prix dans `resolveAnalysisCost`, la fonction même
 * que `consumeAnalysisSlot` appelle pour débiter. Ce fichier n'a aucun prix.
 *
 * Une seule réponse manquante rend le total NON MESURÉ : une somme partielle se
 * lirait comme un devis complet, et serait un plancher déguisé en prix.
 */
type ExactVerificationCost = { measured: true; credits: number; reopened: number; demo: boolean } | { measured: false }

export function exactVerificationCost(input: {
  isDemo: boolean
  /** Une réponse par candidat, dans l'ordre ; `null` = pas (encore) lue. */
  plans: readonly (LaunchPlan | null)[]
}): ExactVerificationCost {
  // En démonstration, `planLaunch` rend `demo` sans rien lire : aucun débit
  // n'est possible dans cet espace, et on ne l'interroge même pas.
  if (input.isDemo) return { measured: true, credits: 0, reopened: 0, demo: true }
  let credits = 0
  let reopened = 0
  for (const plan of input.plans) {
    if (plan === null) return { measured: false }
    if (plan.scenario === 'cache_hit') {
      reopened += 1
      continue
    }
    if (!Number.isFinite(plan.credits)) return { measured: false }
    credits += plan.credits
  }
  return { measured: true, credits, reopened, demo: false }
}
