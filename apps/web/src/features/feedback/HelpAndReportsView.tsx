import { Box, Button, Card, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { MyReportsView } from './MyReportsView'
import { requestReport } from './reportLink'

/**
 * Théo D settings-outils.R5 / N3 — « Aide & signalements » : la page où l'on décrit un problème, retrouve les raccourcis
 * et ses données, suit ce qu'on a transmis.
 *
 * Aucune nouvelle capacité : chaque porte renvoie à l'écran ou au geste EXISTANT (le formulaire de signalement, les
 * raccourcis, Mes données), et la liste « Mes signalements » est celle de
 * toujours.
 * Relancer le tutoriel, la visite, le scénario et le centre d'aide : un seul endroit, `HelpAndAboutGroups` (GA-26).
 */
export function HelpAndReportsView() {
  const { t } = useTranslation('feedback', { keyPrefix: 'help' })

  return (
    <Box className="flex w-full max-w-5xl flex-col gap-6">
      <Box>
        <Text element="h1" size="2xl" weight="bold" color="text-[var(--bellum-text-primary)]">
          {t('title')}
        </Text>
        <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
          {t('subtitle')}
        </Text>
      </Box>

      <Box className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="flex flex-col items-start gap-2 p-4">
          <Text element="h2" size="sm" weight="semibold">
            {t('report.title')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('report.body')}
          </Text>
          <Button type="button" size="sm" className="mt-auto min-h-11" onClick={() => requestReport({ message: '' })}>
            {t('report.action')}
          </Button>
        </Card>
        <Card className="flex flex-col items-start gap-2 p-4">
          <Text element="h2" size="sm" weight="semibold">
            {t('shortcuts.title')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('shortcuts.body')}
          </Text>
          <Button asChild variant="outline" size="sm" className="mt-auto min-h-11">
            <Link to="/settings/shortcuts">{t('shortcuts.action')}</Link>
          </Button>
        </Card>
        <Card className="flex flex-col items-start gap-2 p-4">
          <Text element="h2" size="sm" weight="semibold">
            {t('data.title')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('data.body')}
          </Text>
          <Button asChild variant="outline" size="sm" className="mt-auto min-h-11">
            <Link to="/settings/mes-donnees">{t('data.action')}</Link>
          </Button>
        </Card>
      </Box>

      <MyReportsView embedded />
    </Box>
  )
}
