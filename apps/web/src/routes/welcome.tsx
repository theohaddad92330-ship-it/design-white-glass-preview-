import { createFileRoute, redirect } from '@tanstack/react-router'
import { sessionManager } from '@/features/auth/session-manager'
import { creditsApi } from '@/features/credits/api'
import { onboardingApi } from '@/features/onboarding/api'
import { readOnboardingStateOrUnknown } from '@/features/onboarding/lib/guard-state'
import { needsOnboarding } from '@/features/onboarding/lib/onboarding-gate'
import { WelcomeScreen } from '@/features/welcome/view/WelcomeScreen'

/**
 * Écran cible post-questionnaire (Théo restitution p.8) — the single welcome
 * screen shown after onboarding completes. `useOnboardingNavigation` routes here
 * once the questionnaire's last sub-step is saved (the old `/onboarding/welcome`
 * screen was retired in favour of this pared-down version).
 *
 * Défaut mesuré en prod (passage 12, 17/09) — /welcome INATTEIGNABLE par son
 * URL pour un compte dont l'onboarding est terminé DEPUIS LONGTEMPS. La cause :
 * ce garde ne comparait `state.status` qu'à `'completed'`, alors qu'un compte
 * qui a explicitement reporté le questionnaire (« Plus tard », `skipped_at`
 * posé) ou visite depuis un espace de démonstration n'atteint jamais ce statut
 * — pourtant son onboarding est bien terminé, au sens produit. Ces comptes
 * étaient donc renvoyés vers `/onboarding`, dont le garde (lui-même juste et
 * déjà testé, `onboarding-index-route.test.ts`) les rebondit ensuite vers
 * `landingRouteNow()` (`/chat`) puisque `needsOnboarding` répond `false` pour
 * eux : deux gardes CORRECTS pris séparément, une porte fermée ensemble.
 *
 * Le correctif lit le MÊME prédicat que `/onboarding` et `CustomerPageContent`
 * (`needsOnboarding`, `onboarding-gate.ts` — GA-26, un seul endroit) plutôt que
 * de comparer `status` en dur une troisième fois. Et comme les gardes sœurs
 * de `/onboarding`, `/onboarding/plan` et `/onboarding/company`
 * (`guard-state.ts` — incident 429 documenté), la lecture de l'état est
 * protégée : une panne ne doit jamais planter cet écran, encore moins le
 * faire disparaître.
 */
export const Route = createFileRoute('/welcome')({
  beforeLoad: async () => {
    const { user, sessionUnavailable } = await sessionManager.ensureLoaded()
    // #3243 — un serveur muet n'est pas une session absente : pas de /login.
    if (!user && !sessionUnavailable) throw redirect({ to: '/login' })

    const state = await readOnboardingStateOrUnknown(() => onboardingApi.getState())
    const credits = await creditsApi.getMine().catch(() => null)
    // `state === null` : lecture illisible (429, panne, réseau) — on ne conclut
    // rien, donc on ne renvoie personne (même choix que `useOnboardingStatus`).
    if (state !== null && needsOnboarding({ status: state.status, credits, skippedAt: state.skipped_at ?? null })) {
      throw redirect({ to: '/onboarding' })
    }
  },
  component: WelcomeScreen,
})
