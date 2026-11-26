import { createFileRoute } from '@tanstack/react-router'
import { Button } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { SettingsScreenHeader } from '@/features/settings/components/SettingsScreenHeader'
import { requestReport } from '@/features/feedback/reportLink'
import { SettingsPage } from '@/components/page/SettingsPage'
import { MyReportsView } from '@/features/feedback/MyReportsView'
import { HelpAndAboutGroups } from '@/features/settings/view/HelpAndAboutGroups'

/**
 * Réglages › Aide & signalements (ex « Mes signalements ») — #1960.10 (décision de Louis du 13/09/2026).
 *
 * Le chemin est en FRANÇAIS, comme sa voisine `/settings/mes-donnees` : ce sont
 * les deux pages PERSONNELLES qu'on peut citer à quelqu'un (« regarde dans Mes
 * signalements »), et un lien qui se lit se retrouve.
 */
export const Route = createFileRoute('/settings/mes-signalements')({
  component: MyReportsPage,
})

function MyReportsPage() {
  const { t } = useTranslation('settings', { keyPrefix: 'helpPage' })
  return (
    <SettingsPage>
      {/* Théo D settings-outils (Aide & signalements) — l'en-tête de la page et son geste « Préparer un signalement »
          (le MÊME formulaire que le bouton flottant, rien n'est envoyé seul), puis l'aide et « Revoir les débuts »
          (A2 / A6 : ce ne sont pas des préférences), enfin « Mes signalements ». */}
      <div className="mb-6 w-full max-w-5xl">
        <SettingsScreenHeader
          scope="personal"
          title={t('title')}
          description={t('description')}
          actions={
            <Button
              type="button"
              variant="violet"
              size="sm"
              className="min-h-11"
              onClick={() => requestReport({ message: '' })}
            >
              {t('prepareReport')}
            </Button>
          }
        />
      </div>
      <div className="mb-6 w-full max-w-5xl">
        <HelpAndAboutGroups />
      </div>
      <MyReportsView embedded />
    </SettingsPage>
  )
}
