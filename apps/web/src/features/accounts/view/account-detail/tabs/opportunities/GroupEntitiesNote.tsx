import type { AccountSignalLine } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { groupEntitiesSummary } from './signal-table'

/** Lot 773 (e) — « N besoins sur M entités du groupe » : une phrase en tête, seulement quand la base commune a lu plusieurs entités. */
export function GroupEntitiesNote({ lines }: { lines: readonly AccountSignalLine[] }) {
  const { t } = useTranslation('projects')
  const summary = groupEntitiesSummary(lines)
  if (!summary) return null
  return (
    <Text size="xs" color="text-[var(--bellum-text-secondary)]" data-testid="signal-group-entities">
      {t('signalTable.groupSummary', { count: summary.needs, entities: summary.entities })}
    </Text>
  )
}
