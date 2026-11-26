import { createFileRoute } from '@tanstack/react-router'
import { SettingsPage } from '@/components/page/SettingsPage'
import { PrivacyView } from '@/features/settings/view/PrivacyView'

/**
 * Confidentialité & registre — #4295.15. `/privacy` n'avait AUCUNE route dans l'app (la politique publiée vit sur le
 * site) : « Page introuvable » en recette de production. L'adresse existe maintenant, dans le cadre des réglages.
 */
export const Route = createFileRoute('/privacy/')({
  component: PrivacyPage,
})

function PrivacyPage() {
  return (
    <SettingsPage>
      <PrivacyView />
    </SettingsPage>
  )
}
