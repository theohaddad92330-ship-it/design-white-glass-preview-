import type { IntegrationExchange } from '@bellum/contracts'
import { clientToolName } from '@bellum/contracts'
import { Badge, Box, Spinner, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useCrmExchanges } from '@/features/crm-import/api'
import { formatDateTime } from '@/lib/locale'

/**
 * Théo D settings-integrations.N4 — l'onglet « Historique » : les opérations RÉELLEMENT faites avec les outils
 * branchés, et leur résultat rapporté par l'outil. Une ligne n'est « confirmée » que si l'outil a répondu ; un refus
 * garde sa raison telle quelle. Aucun état de connexion inventé : sans opération, la phrase le dit.
 */
export function HistoryTab() {
  const { t } = useTranslation('integrationCenter', { keyPrefix: 'grid.history' })
  const exchanges = useCrmExchanges(true)

  if (exchanges.isLoading) {
    return (
      <Box className="flex h-32 items-center justify-center">
        <Spinner />
      </Box>
    )
  }

  const items = exchanges.data ?? []
  return (
    <Box className="flex flex-col gap-4">
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('intro')}
      </Text>
      {items.length === 0 ? (
        <Text size="sm">{t('empty')}</Text>
      ) : (
        <ul className="flex flex-col divide-y divide-[var(--bellum-border)] rounded-lg border border-[var(--bellum-border)]">
          {items.map(item => (
            <ExchangeRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </Box>
  )
}

function ExchangeRow({ item }: { item: IntegrationExchange }) {
  const { t } = useTranslation('integrationCenter', { keyPrefix: 'grid.history' })
  const tool = clientToolName(item.provider) ?? item.provider
  const entity = item.entityType ? t(`entity.${item.entityType}`) : null
  const operation =
    item.kind === 'write'
      ? t('operation.write')
      : item.kind === 'first_sync'
        ? t('operation.first_sync')
        : item.counts
          ? t('operation.read', {
              entity: entity ?? t('entity.record'),
              count: item.counts.updated + item.counts.created,
            })
          : t('operation.readPlain')

  return (
    <li className="grid grid-cols-1 gap-1 p-3 md:grid-cols-[11rem_9rem_1fr_auto] md:items-center md:gap-3">
      <Text size="sm" className="text-[var(--bellum-text-secondary)]">
        {formatDateTime(item.at)}
      </Text>
      <Text size="sm" weight="medium">
        {tool}
      </Text>
      <Box>
        <Text size="sm">{operation}</Text>
        {item.detail ? (
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {item.detail}
          </Text>
        ) : null}
      </Box>
      <Badge
        variant={item.result === 'refused' ? 'destructive' : item.result === 'to_review' ? 'outline' : 'success'}
        className="text-xs"
      >
        {item.result === 'to_review' && item.counts
          ? t('result.to_review_count', { count: item.counts.conflicts })
          : t(`result.${item.result}`)}
      </Badge>
    </li>
  )
}
