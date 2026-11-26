import { test } from '@playwright/test'

/**
 * #2085.35 — parcours E2E « workspace existant » : la RECONFIGURATION guidée
 * (`OnboardingWelcomePage.tsx`, `entry === 'reconfiguration' | 'resume'`) —
 * un espace dont l'onboarding a déjà tourné une fois, à qui l'on redemande
 * une partie des réponses (changement d'offre, de marché…), jamais un
 * parcours neuf.
 *
 * ⚠️ NON JOUABLE dans ce socle e2e (Tier 2). Même blocage que #2085.32/.33/.34
 * — voir `self-service.spec.ts`. Prérequis propre : un compte seedé dont
 * `status` est DÉJÀ `completed` (ou `refresh_required`, #2004), pas
 * `not_started` — le seed n°1 du README couvre un onboarding VIERGE, pas un
 * état intermédiaire ou terminé.
 */
test.describe('onboarding — reconfiguration d’un espace existant (#2085.35)', () => {
  test('les anciennes réponses sont GARDÉES, seule la question manquante est reposée', async ({ page }) => {
    test.skip(
      true,
      'Tier 3 (parcours authentifiés) absent — voir e2e/README.md §Roadmap. Ce scénario demande un compte seedé DÉJÀ onboardé (status completed/refresh_required), au-delà du seed « vierge » du prérequis n°1.',
    )

    // Le scénario à jouer une fois le Tier 3 posé :
    // 1. Compte seedé avec `status: 'completed'` et une réponse à reconfigurer
    //    (ex. `esn_name` changé côté back-office → `reconfigurationPlan`
    //    détecte une divergence).
    // 2. `/welcome` (OnboardingWelcomePage) affiche `welcome.refresh.title`,
    //    PAS `welcome.title` (chemin neuf) — texte de reconfiguration, jamais
    //    « tout est à refaire ».
    // 3. Le clic reprend à la PREMIÈRE sous-étape encore sans réponse
    //    (`firstPendingSubStep`), jamais au début.
    // 4. Les réponses déjà données restent visibles/pré-remplies — aucune
    //    perte de saisie.
    await page.goto('/login')
  })
})
