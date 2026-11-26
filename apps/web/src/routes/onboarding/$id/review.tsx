import { createFileRoute, redirect } from '@tanstack/react-router'
import { sessionManager } from '@/features/auth/session-manager'
import { OnboardingReviewPage } from '@/features/onboarding/view/OnboardingReviewPage'

/**
 * `/onboarding/$id/review` — #2030 « RELIRE AVANT DE GÉNÉRER L'AUDIT ».
 *
 * Même garde d'authentification que `$id/$stage/$slug` : un visiteur non
 * connecté ne doit jamais atteindre le récapitulatif de son questionnaire.
 */
export const Route = createFileRoute('/onboarding/$id/review')({
  beforeLoad: async () => {
    const { user, sessionUnavailable } = await sessionManager.ensureLoaded()
    // #3243 — un serveur muet n'est pas une session absente : pas de /login.
    if (!user && !sessionUnavailable) throw redirect({ to: '/login' })
  },
  component: OnboardingReviewPage,
})
