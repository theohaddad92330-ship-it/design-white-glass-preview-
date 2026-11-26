import { createFileRoute, redirect } from '@tanstack/react-router'
import { sessionManager } from '@/features/auth/session-manager'
import { findTheme } from '@/features/onboarding/lib/theme-catalog'
import { OnboardingThemePage } from '@/features/onboarding/view/OnboardingThemePage'

/**
 * `/onboarding/themes/$themeId` — Théo O onboarding-theme : le détail d'un
 * thème. Un thème inconnu renvoie au catalogue, jamais à une page vide.
 */
export const Route = createFileRoute('/onboarding/themes/$themeId')({
  beforeLoad: async ({ params }) => {
    const { user, sessionUnavailable } = await sessionManager.ensureLoaded()
    // #3243 — un serveur muet n'est pas une session absente : pas de /login.
    if (!user && !sessionUnavailable) throw redirect({ to: '/login' })
    if (!findTheme(params.themeId)) throw redirect({ to: '/onboarding/themes' })
  },
  component: ThemeRouteComponent,
})

function ThemeRouteComponent() {
  const { themeId } = Route.useParams()
  return <OnboardingThemePage themeSlug={themeId} />
}
