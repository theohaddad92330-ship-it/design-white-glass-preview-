import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { PreferencesView } from '@/features/settings/view/PreferencesView'

export const Route = createFileRoute('/settings/')({
  component: SettingsIndexPage,
})

function SettingsIndexPage() {
  return (
    <SettingsPage anchorId="parametres">
      <PreferencesView />
    </SettingsPage>
  )
}
