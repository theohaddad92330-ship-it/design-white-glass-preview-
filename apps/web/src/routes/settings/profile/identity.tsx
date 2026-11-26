import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { PreferencesView } from '@/features/settings/view/PreferencesView'

export const Route = createFileRoute('/settings/profile/identity')({
  component: ProfileIdentityRoute,
})

function ProfileIdentityRoute() {
  return (
    <SettingsPage>
      {/* Théo D settings-prefs.R4 — l'adresse reste (`MailboxSignatureCard`, mémoire, brief y renvoient),
          la page est le sous-onglet « Mon identité ». */}
      <PreferencesView initialTab="identity" />
    </SettingsPage>
  )
}
