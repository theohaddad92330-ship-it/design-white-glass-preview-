import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useCrmReadStatus } from '@/features/crm-import/api'
import { formatDateTime } from '@/lib/locale'
import { providerLabel } from '../lib/provider-label'

/**
 * #4590.2 — la zone « lecture des CRM » : chaque CRM effectivement branché, nommé, avec la date de sa dernière
 * lecture (`GET /crm/import/status`). Aucun branché ⇒ la zone le dit ; date absente ⇒ « jamais lu » (jamais la date
 * du jour) ; un échec de l'API se dit « état de lecture indisponible », jamais un faux « rien à signaler ».
 */
export function CrmReadSummary() {
  const { t } = useTranslation('integrationCenter', { keyPrefix: 'crmRead' })
  const { data, isError, isLoading } = useCrmReadStatus(true)

  if (isLoading) return null
  if (isError || !data) {
    return (
      <Text size="sm" data-testid="crm-read-unavailable" className="text-[var(--warning-soft-text)]">
        {t('unavailable')}
      </Text>
    )
  }
  if (data.length === 0) {
    return (
      <Text size="sm" data-testid="crm-read-none" className="text-[var(--bellum-text-secondary)]">
        {t('none')}
      </Text>
    )
  }
  return (
    <Box as="section" aria-label={t('title')} className="flex flex-col gap-1">
      <Text size="xs" weight="semibold" className="text-[var(--bellum-text-secondary)]">
        {t('title')}
      </Text>
      <ul className="flex flex-col gap-1">
        {data.map(status => {
          const at = status.lastSyncAt && !Number.isNaN(Date.parse(status.lastSyncAt)) ? status.lastSyncAt : null
          return (
            <li key={status.provider} data-testid="crm-read-row" className="text-sm">
              <span className="font-medium">{providerLabel(status.provider)}</span>
              <span className="text-[var(--bellum-text-secondary)]">
                {' · '}
                {at ? t('lastRead', { date: formatDateTime(at) }) : t('neverRead')}
              </span>
            </li>
          )
        })}
      </ul>
    </Box>
  )
}
