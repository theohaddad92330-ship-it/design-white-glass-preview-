import { createFileRoute, redirect } from '@tanstack/react-router'
import { firstSlugOfStage, TEMPS1_STAGE_CODES } from '@/features/onboarding/lib/questions'

export const Route = createFileRoute('/onboarding/$id/$stage/')({
  beforeLoad: ({ params }) => {
    if (!TEMPS1_STAGE_CODES.includes(params.stage)) throw redirect({ to: '/onboarding' })
    const slug = firstSlugOfStage(params.stage)
    if (!slug) throw redirect({ to: '/onboarding' })
    throw redirect({ to: '/onboarding/$id/$stage/$slug', params: { id: params.id, stage: params.stage, slug } })
  },
})
