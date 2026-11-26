import { test } from '@playwright/test'

/**
 * #2085.34 — parcours E2E « invité » : un utilisateur qui rejoint un espace
 * DÉJÀ EXISTANT via une invitation d'équipe (`WorkspaceTeamService`,
 * `useTeam().invite`, #2085.13), jusqu'à son propre onboarding.
 *
 * ⚠️ NON JOUABLE dans ce socle e2e (Tier 2). Même blocage que #2085.32/.33.
 * Prérequis propre : DEUX comptes seedés (l'inviteur, déjà dans un espace
 * avec `team:manage`, et l'invité, dont le compte n'existe qu'après avoir
 * suivi le lien d'invitation) — le Tier 3 du README ne décrit qu'UN
 * utilisateur de test ; ce scénario en demande deux qui interagissent.
 *
 * #4158.8 — raison NON levable sans infra (deux comptes authentifiés qui
 * interagissent). Le même parcours (invitation, acceptation, arrivée dans LE
 * MÊME espace, renvoi, expiration, isolation) est joué côté API, sur de vrais
 * services et deux utilisateurs, par
 * `apps/api/src/modules/workspace/team-two-users.integration.spec.ts`.
 * Le skip reste jusqu'à ce que le Tier 3 existe.
 */
test.describe('onboarding — invité rejoint un espace existant (#2085.34)', () => {
  test('un invité accepte, arrive dans LE MÊME espace, avec son propre onboarding', async ({ page }) => {
    test.skip(
      true,
      'Tier 3 (parcours authentifiés) absent — voir e2e/README.md §Roadmap. Ce scénario demande DEUX comptes seedés qui interagissent (inviteur + invité), au-delà du prérequis n°1 déjà documenté.',
    )

    // Le scénario à jouer une fois le Tier 3 posé (et son extension à deux
    // comptes) :
    // 1. Compte A (déjà onboardé, `team:manage`) invite `invite@example.test`
    //    depuis `/settings/team` (`TeamView.tsx`).
    // 2. Le lien d'invitation crée/authentifie le compte B.
    // 3. Compte B traverse SON PROPRE onboarding (les réponses ne sont pas
    //    celles du compte A — chaque utilisateur répond pour lui-même).
    // 4. Vérifier que B atterrit dans le MÊME `workspace_id` que A (visible
    //    depuis `/settings/team`, B apparaît dans la liste des membres).
    await page.goto('/login')
  })
})
