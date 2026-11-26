import { createFileRoute, redirect } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { TEMPS1_STAGE_CODES } from '@/features/onboarding/lib/questions'
import { ProfileStagePage } from '@/features/profile/view/ProfileStagePage'

export const Route = createFileRoute('/settings/profile/$stage')({
  beforeLoad: ({ params }) => {
    if (!TEMPS1_STAGE_CODES.includes(params.stage)) throw redirect({ to: '/settings/profile' })
  },
  component: ProfileStageRoute,
})

function ProfileStageRoute() {
  return (
    <SettingsPage>
      <ProfileStagePage />
    </SettingsPage>
  )
}
