import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * Théo D settings-integrations.N1 — Collective.work : aucun branchement n'existe, et on ne le simule pas.
 * La carte dit les trois usages et que le périmètre est à contractualiser ; elle ne propose AUCUN bouton
 * « Connecter » (jamais un geste qui répondrait par une erreur). Le nom est celui d'une plateforme du client :
 * le nommer est admis (« on nomme ce que l'espace a branché »).
 */
export function CollectiveWorkNote() {
  const { t } = useTranslation('integrations', { keyPrefix: 'gridCollective' })
  return (
    <Box className="flex flex-col gap-2 rounded-lg border border-[var(--bellum-border)] p-4">
      <Text size="sm" weight="semibold">
        {t('title')}
      </Text>
      <Text size="sm">{t('body')}</Text>
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('contract')}
      </Text>
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('detected')}
      </Text>
    </Box>
  )
}
