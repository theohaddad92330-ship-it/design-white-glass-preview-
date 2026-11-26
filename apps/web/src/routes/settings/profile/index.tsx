import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { ProfilePage } from '@/features/profile/view/ProfilePage'

export const Route = createFileRoute('/settings/profile/')({
  component: ProfileRoute,
})

function ProfileRoute() {
  return (
    <SettingsPage>
      <ProfilePage />
    </SettingsPage>
  )
}
