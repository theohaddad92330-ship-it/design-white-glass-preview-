import { test } from '@playwright/test'

/**
 * #2085.32 — parcours E2E « self-service » : un utilisateur qui s'inscrit
 * seul, sans invitation, jusqu'au premier audit.
 *
 * ⚠️ NON JOUABLE dans ce socle e2e (Tier 2, voir `e2e/README.md` — « Roadmap
 * Tier 3 »). Ce socle sert le SPA en anonyme sur un port mort
 * (`VITE_API_URL` mort exprès, session résolue « anonyme » de façon
 * déterministe) : il n'y a NI backend réel, NI Postgres/Redis, NI utilisateur
 * de test seedé. Le parcours self-service traverse `/login` → OTP e-mail →
 * `/onboarding` → questionnaire (12 sous-étapes) → `/onboarding/$id/review`
 * → `/onboarding/$id/generating` (job IA 3-6 min) → `/welcome` — chaque étape
 * suppose une écriture serveur réelle.
 *
 * Ce que le README de ce socle nomme comme PRÉREQUIS n°1, absent aujourd'hui :
 * un utilisateur de test seedé (script de seed idempotent côté API) + un
 * environnement API + Postgres + Redis éphémère (ou staging e2e dédié) + un
 * project Playwright `web-authenticated` avec `storageState`.
 *
 * Un skip NOMMÉ vaut mieux qu'un test absent ou un faux vert : ce fichier
 * documente le scénario exact à jouer le jour où le Tier 3 existe.
 */
test.describe('onboarding — self-service (#2085.32)', () => {
  test('un utilisateur neuf s’inscrit, répond au questionnaire, et voit son premier audit', async ({ page }) => {
    test.skip(
      true,
      'Tier 3 (parcours authentifiés) absent — voir e2e/README.md §Roadmap. Aucun backend, aucun utilisateur seedé.',
    )

    // Le scénario à jouer une fois le Tier 3 posé :
    // 1. `page.goto('/login')` → e-mail → code OTP (utilisateur de test seedé).
    // 2. Redirection vers `/onboarding` (état `not_started`).
    // 3. Répondre aux 12 sous-étapes de `TEMPS1_SUBSTEPS` (`useOnboardingNavigation`).
    // 4. `/onboarding/$id/review` → CTA « Générer mon audit ».
    // 5. `/onboarding/$id/generating` → attendre les six phases réelles.
    // 6. Clic MANUEL « Découvrir mon audit » → `/welcome` — jamais une
    //    redirection automatique après le job IA (#2089.36).
    // 7. Vérifier : profil réellement sauvegardé, 4 promesses, premières
    //    suggestions, double CTA (Théo restitution P0-01, p.6/8).
    await page.goto('/login')
  })
})
