import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { TeamView } from '@/features/team/view/TeamView'

export const Route = createFileRoute('/settings/team')({
  component: TeamPage,
})

function TeamPage() {
  return (
    <SettingsPage>
      <TeamView />
    </SettingsPage>
  )
}
