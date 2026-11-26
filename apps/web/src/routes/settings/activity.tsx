import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { ActivityLogView } from '@/features/team/view/ActivityLogView'

export const Route = createFileRoute('/settings/activity')({
  component: ActivityPage,
})

function ActivityPage() {
  return (
    <SettingsPage>
      <ActivityLogView />
    </SettingsPage>
  )
}
