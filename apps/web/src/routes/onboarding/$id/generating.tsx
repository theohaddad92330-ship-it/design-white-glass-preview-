import { createFileRoute, redirect } from '@tanstack/react-router'
import { sessionManager } from '@/features/auth/session-manager'
import { OnboardingGeneratingPage } from '@/features/onboarding/view/OnboardingGeneratingPage'

/**
 * `/onboarding/$id/generating` — #2089.28 « écran de génération dédié ».
 *
 * Même garde d'authentification que `$id/review` : un visiteur non connecté
 * ne doit jamais atteindre cet écran.
 */
export const Route = createFileRoute('/onboarding/$id/generating')({
  beforeLoad: async () => {
    const { user, sessionUnavailable } = await sessionManager.ensureLoaded()
    // #3243 — un serveur muet n'est pas une session absente : pas de /login.
    if (!user && !sessionUnavailable) throw redirect({ to: '/login' })
  },
  component: OnboardingGeneratingPage,
})
