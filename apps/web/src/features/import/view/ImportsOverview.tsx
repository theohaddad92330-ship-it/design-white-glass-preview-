import { Box, Button, Card, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

/**
 * Théo D settings-outils.R1 / N2 — LA PAGE IMPORTS en trois blocs : le vivier, « depuis un outil connecté », et « ce qui
 * sera vérifié » avant qu'une ligne soit créée.
 *
 * Ce n'est pas un second import : le haut de page ORIENTE, les assistants existants (reprise de fichiers, comptes et
 * contacts, historique) suivent dessous et font le travail. « Depuis un outil connecté » renvoie aux Connecteurs
 * (la reprise d'un CRM se lit sur SA carte) ; l'export du vivier garde sa page. Le journal est celui de l'historique
 * des imports, plus bas — jamais une liste dupliquée ici.
 */
export function ImportsOverview() {
  const { t } = useTranslation('importWizard', { keyPrefix: 'overview' })
  return (
    <Box className="mb-6 flex flex-col gap-4">
      <Box>
        <Text element="h1" size="xl" weight="semibold">
          {t('title')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('subtitle')}
        </Text>
      </Box>
      <Box className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="flex flex-col items-start gap-2 p-4">
          <Text element="h2" size="sm" weight="semibold">
            {t('vivier.title')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('vivier.body')}
          </Text>
          <Button asChild size="sm" className="mt-auto min-h-11">
            <a href="#import-launcher">{t('vivier.action')}</a>
          </Button>
        </Card>
        <Card className="flex flex-col items-start gap-2 p-4">
          <Text element="h2" size="sm" weight="semibold">
            {t('tool.title')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('tool.body')}
          </Text>
          <Button asChild variant="outline" size="sm" className="mt-auto min-h-11">
            <Link to="/integrations">{t('tool.action')}</Link>
          </Button>
        </Card>
        <Card className="flex flex-col items-start gap-2 p-4">
          <Text element="h2" size="sm" weight="semibold">
            {t('export.title')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('export.body')}
          </Text>
          <Button asChild variant="outline" size="sm" className="mt-auto min-h-11">
            <Link to="/settings/mes-donnees">{t('export.action')}</Link>
          </Button>
        </Card>
      </Box>
      <Card className="flex flex-col gap-3 p-4">
        <Box>
          <Text element="h2" size="sm" weight="semibold">
            {t('checked.title')}
          </Text>
          <Text size="sm" className="text-[var(--bellum-text-secondary)]">
            {t('checked.subtitle')}
          </Text>
        </Box>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <li>
            <Text size="sm" weight="medium">
              {t('checked.mapping')}
            </Text>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('checked.mappingBody')}
            </Text>
          </li>
          <li>
            <Text size="sm" weight="medium">
              {t('checked.duplicates')}
            </Text>
            <Text size="sm" className="text-[var(--bellum-text-secondary)]">
              {t('checked.duplicatesBody')}
            </Text>
          </li>
          <li>
            <Text size="sm" weight="medium">
              {t('checked.history')}
            </Text>
            <a
              href="#import-history"
              className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] hover:underline"
            >
              {t('checked.historyAction')}
            </a>
          </li>
        </ul>
      </Card>
    </Box>
  )
}
