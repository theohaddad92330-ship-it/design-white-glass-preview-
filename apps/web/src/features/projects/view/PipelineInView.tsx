import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * Théo C projects-pipeline.R3 — LE CHIFFRE DE TÊTE : « 8 affaires dans cette vue ». Il compte ce que la vue montre
 * (filtres compris), jamais le serveur entier. Zéro se dit « Aucune affaire », pas « 0 affaire ».
 */
export function PipelineInView({ count }: { count: number }) {
  const { t } = useTranslation('projects')
  return (
    <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
      {count === 0 ? t('pipeline.inViewNone') : t('pipeline.inView', { count })}
    </Text>
  )
}
