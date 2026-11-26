import { createFileRoute, redirect } from '@tanstack/react-router'
import { sessionManager } from '@/features/auth/session-manager'
import { OnboardingThemesPage } from '@/features/onboarding/view/OnboardingThemesPage'

/**
 * `/onboarding/themes` — Théo O onboarding-catalogue : les 16 thèmes à
 * approfondir. Même garde d'authentification que le reste du parcours.
 */
export const Route = createFileRoute('/onboarding/themes/')({
  beforeLoad: async () => {
    const { user, sessionUnavailable } = await sessionManager.ensureLoaded()
    // #3243 — un serveur muet n'est pas une session absente : pas de /login.
    if (!user && !sessionUnavailable) throw redirect({ to: '/login' })
  },
  component: OnboardingThemesPage,
})
