import type { LaunchPlan } from '@/features/search/hooks/useLaunchPlan'

/**
 * #2166.56 (suite, 18/09/2026 soir) — LE COÛT ANNONCÉ EST LE COÛT DÉBITÉ.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE SOMME PAR ENTREPRISE, ET PAS « PRIX DE GRILLE × NOMBRE »
 * ─────────────────────────────────────────────────────────────────────────────
 * `batchAnalysisCost` (`discover-batch-analyze.ts`) multipliait le prix de
 * grille (`creditCostOf('account_analysis')`) par le nombre de candidats
 * cochés. Juste pour un lancement NEUF — faux dès qu'un candidat est un
 * compte DÉJÀ analysé dans l'espace : le lanceur (`POST /analysis/start`)
 * ROUVRE ce dossier sans débit (`cache_hit`), et la démonstration ne débite
 * jamais rien. Le devis annonçait 8 crédits là où 0 seraient débités — le
 * défaut mesuré en production ce soir, sur le dialogue de Découvrir.
 *
 * Même correctif que #2288.4 (`features/consultants/lib/marketVerificationCost.ts`) :
 * la somme se fait sur les réponses de `GET /analysis/launch-plan`
 * (`AnalysisService.planLaunch`, lu par `launchPlanQueryOptions`, PARTAGÉ avec
 * le lanceur — GA-26, même clé, même cache) plutôt que sur un prix recalculé
 * ici. Ce fichier n'a aucun prix.
 *
 * Une seule réponse manquante ou illisible rend le total NON MESURÉ : une
 * somme partielle se lirait comme un devis complet, et serait un plancher
 * déguisé en prix.
 */
type ExactBatchAnalysisCost =
  { measured: true; credits: number; alreadyAnalyzed: number; demo: boolean } | { measured: false }

export function exactBatchAnalysisCost(input: {
  isDemo: boolean
  /** Une réponse par candidat coché, dans l'ordre ; absente = pas (encore) lue. */
  plans: readonly (LaunchPlan | null | undefined)[]
}): ExactBatchAnalysisCost {
  // En démonstration, `planLaunch` rend `demo` sans rien lire : aucun débit
  // n'est possible dans cet espace, et on ne l'interroge même pas.
  if (input.isDemo) return { measured: true, credits: 0, alreadyAnalyzed: 0, demo: true }
  let credits = 0
  let alreadyAnalyzed = 0
  for (const plan of input.plans) {
    if (!plan) return { measured: false }
    if (plan.scenario === 'cache_hit') {
      alreadyAnalyzed += 1
      continue
    }
    if (plan.scenario !== 'fresh' || !Number.isFinite(plan.credits)) return { measured: false }
    credits += plan.credits
  }
  return { measured: true, credits, alreadyAnalyzed, demo: false }
}
