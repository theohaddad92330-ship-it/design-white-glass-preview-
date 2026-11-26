import { test } from '@playwright/test'

/**
 * #2085.33 — parcours E2E « bêta » : un utilisateur entré par le lien de bêta
 * (label `beta-client`/`beta-feedback`, invitation nominative hors flux
 * self-service), jusqu'au premier audit.
 *
 * ⚠️ NON JOUABLE dans ce socle e2e (Tier 2). Même blocage que #2085.32
 * (voir `self-service.spec.ts`) : aucun backend, aucun utilisateur seedé,
 * aucun mécanisme pour poser un compte bêta réel. Ce parcours a EN PLUS un
 * prérequis propre : un compte marqué bêta (pas seulement un compte normal)
 * pour vérifier que rien de spécifique au flux self-service (facturation,
 * grille tarifaire) ne s'affiche à tort à un bêta-testeur.
 */
test.describe('onboarding — entrée bêta (#2085.33)', () => {
  test('un compte bêta traverse le questionnaire sans écran de facturation', async ({ page }) => {
    test.skip(true, 'Tier 3 (parcours authentifiés) absent — voir e2e/README.md §Roadmap. Aucun compte bêta seedé.')

    // Le scénario à jouer une fois le Tier 3 posé :
    // 1. Un compte de test marqué bêta (seed dédié, distinct de #2085.32).
    // 2. Même parcours que self-service, mais vérifier qu'AUCUN écran de
    //    facturation / grille tarifaire n'interrompt le questionnaire
    //    (Onboarding GRATUIT de bout en bout, doctrine 0 crédit).
    // 3. Vérifier que le lien de bêta n'ouvre PAS une session anonyme
    //    (distinct du lien de démo publique, `DEMO_LINK_TOKEN`).
    await page.goto('/login')
  })
})
