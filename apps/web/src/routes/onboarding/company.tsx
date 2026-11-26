import { createFileRoute, redirect } from '@tanstack/react-router'
import { sessionManager } from '@/features/auth/session-manager'
import { onboardingApi } from '@/features/onboarding/api'
import { readOnboardingStateOrUnknown } from '@/features/onboarding/lib/guard-state'
import { landingRouteNow } from '@/features/preferences/preferences-provider'
import { OnboardingCompanyPage } from '@/features/onboarding/view/OnboardingCompanyPage'

/**
 * `/onboarding/company` — the ESN prefill screen, first stop of a brand-new
 * onboarding. Reachable directly (a user who bookmarked it, or came back via
 * "Ce n'est pas ma société"), so it re-checks the same guards as
 * `/onboarding/`: signed in, and not already finished.
 */
export const Route = createFileRoute('/onboarding/company')({
  beforeLoad: async () => {
    const { user, sessionUnavailable } = await sessionManager.ensureLoaded()
    // #3243 — un serveur muet n'est pas une session absente : pas de /login.
    if (!user && !sessionUnavailable) throw redirect({ to: '/login' })

    // Un état illisible affiche l'écran plutôt que de faire planter le garde.
    const state = await readOnboardingStateOrUnknown(() => onboardingApi.getState())
    // #1786 — dérivée comme partout ailleurs, jamais `/dashboard` en dur.
    if (state?.status === 'completed') throw redirect({ to: landingRouteNow() })
  },
  component: OnboardingCompanyPage,
})
