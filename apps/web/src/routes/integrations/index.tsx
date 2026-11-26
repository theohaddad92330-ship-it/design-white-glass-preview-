import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { IntegrationCenterPage } from '@/features/integration-center/view/IntegrationCenterPage'

/**
 * L'écran Intégrations — le seul.
 *
 * Réglages › Intégrations redirige ici depuis le 14/08 : il y avait deux écrans
 * pour un même sujet, l'un pour brancher et l'autre pour surveiller, et ils ne
 * disaient pas la même chose du même outil. La surveillance qui n'appelle aucun
 * geste (inventaire des outils non offerts, débits, rétention, journal de
 * livraison) est passée au back-office.
 *
 * Il rend `SettingsPage` et non `CustomerPage` : la seule porte vers cet écran
 * est la barre de Réglages, et sur `CustomerPage` cette barre repassait au menu
 * principal à l'arrivée — l'utilisateur était sorti des Réglages sans l'avoir
 * demandé, et devait y rentrer pour le réglage suivant. `/billing`, voisin dans
 * la même barre, vit lui aussi hors de `/settings` avec cette coquille : ce qui
 * décide de la barre est la coquille, pas l'URL. Verrouillé par
 * `settings-nav-shell.test.ts`.
 */
export const Route = createFileRoute('/integrations/')({
  component: IntegrationsRoute,
})

function IntegrationsRoute() {
  return (
    <SettingsPage anchorId="integrations">
      <IntegrationCenterPage />
    </SettingsPage>
  )
}
