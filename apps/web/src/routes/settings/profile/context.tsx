import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { ProfileContextSubPage } from '@/features/profile/view/ProfileContextSubPage'

export const Route = createFileRoute('/settings/profile/context')({
  component: ProfileContextRoute,
})

function ProfileContextRoute() {
  return (
    <SettingsPage>
      <ProfileContextSubPage />
    </SettingsPage>
  )
}
