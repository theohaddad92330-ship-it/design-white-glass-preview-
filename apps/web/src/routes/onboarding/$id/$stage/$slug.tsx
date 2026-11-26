import { createFileRoute, redirect } from '@tanstack/react-router'
import { sessionManager } from '@/features/auth/session-manager'
import { OnboardingStagePage } from '@/features/onboarding/view/OnboardingStagePage'
import { findSubStep, firstSlugOfStage, TEMPS1_STAGE_CODES } from '@/features/onboarding/lib/questions'

export const Route = createFileRoute('/onboarding/$id/$stage/$slug')({
  beforeLoad: async ({ params }) => {
    const { user, sessionUnavailable } = await sessionManager.ensureLoaded()
    // #3243 — un serveur muet n'est pas une session absente : pas de /login.
    if (!user && !sessionUnavailable) throw redirect({ to: '/login' })
    if (!TEMPS1_STAGE_CODES.includes(params.stage)) throw redirect({ to: '/onboarding' })
    if (!findSubStep(params.stage, params.slug)) {
      const slug = firstSlugOfStage(params.stage)
      if (!slug) throw redirect({ to: '/onboarding' })
      throw redirect({ to: '/onboarding/$id/$stage/$slug', params: { id: params.id, stage: params.stage, slug } })
    }
  },
  component: OnboardingStagePage,
})
