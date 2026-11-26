import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { NotificationsView } from '@/features/settings/view/NotificationsView'

/**
 * Les notifications. Le catalogue « Ce que {{copilot}} peut te proposer » (D49) n'est plus posé ici : la maquette
 * `settings-laura` (Théo V22, Louis 22/10/2026) le range avec les automatisations, dans Réglages › Laura › Routines &
 * veilles, qui renvoie VERS ce réglage fin pour couper une proposition. `NotificationsView` reste la porte unique
 * de l'interrupteur et du plafond de proactivité (GA-26).
 */
export const Route = createFileRoute('/settings/notifications')({
  component: NotificationsPage,
})

function NotificationsPage() {
  return (
    <SettingsPage>
      <NotificationsView />
    </SettingsPage>
  )
}
