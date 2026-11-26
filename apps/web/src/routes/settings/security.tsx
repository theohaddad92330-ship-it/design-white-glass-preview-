import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { SecurityView } from '@/features/settings/view/SecurityView'

export const Route = createFileRoute('/settings/security')({
  component: SecurityPage,
})

function SecurityPage() {
  return (
    <SettingsPage>
      <SecurityView />
    </SettingsPage>
  )
}
