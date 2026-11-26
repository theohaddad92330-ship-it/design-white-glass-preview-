import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { CommercialAuditScreen } from '@/features/commercial-audit/view/CommercialAuditScreen'

export const Route = createFileRoute('/settings/profile/audit')({
  component: CommercialAuditRoute,
})

function CommercialAuditRoute() {
  return (
    <SettingsPage>
      <CommercialAuditScreen />
    </SettingsPage>
  )
}
