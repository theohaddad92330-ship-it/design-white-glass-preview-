import type { MarketBrief } from '@bellum/contracts'
import { Badge, Card, Text } from '@bellum/ui'
import { ResponsiveTable } from '@/components/primitives/ResponsiveTable'
import { useTranslation } from 'react-i18next'
import { ShowMoreButton, useRevealed } from '@/features/brief-blocks/ShowMore'
import { formatCount } from '@/lib/locale'
import type { RenderAccountLink } from './account-link'

/**
 * Recette 06/10/2026 : la source écrit une tranche ouverte « 10001-10001 » (borne haute = borne basse).
 * Elle se lit « 10 001 et plus » ; toute autre tranche reste telle que la source l'écrit.
 */
function readSize(size: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const match = /^(\d+)\s*-\s*(\d+)$/.exec(size.trim())
  if (match && match[1] === match[2]) return t('clients.sizeOpen', { formatted: formatCount(Number(match[1])) })
  return size
}

/**
 * Clients de la zone, triés par profils décroissants (ceux sans chiffre en
 * dernier). `linkedAccountIds` : nom du client → id du compte quand il existe
 * dans l'espace ; sans lien fourni, le nom reste en texte.
 */
export function ZoneClients({
  clients,
  linkedAccountIds,
  renderAccountLink,
}: {
  clients: NonNullable<MarketBrief['clients']>
  linkedAccountIds?: Readonly<Record<string, string>>
  renderAccountLink?: RenderAccountLink
}) {
  const { t } = useTranslation('marketBrief')
  const { visible, nextCount, revealMore } = useRevealed(clients.length)
  if (clients.length === 0) return null
  const sorted = [...clients].sort((a, b) => (b.profiles ?? -1) - (a.profiles ?? -1))

  return (
    <Card data-testid="market-clients" className="min-w-0 p-5">
      <Text element="h3" size="base" weight="semibold">
        {t('clients.title')}
      </Text>
      <ResponsiveTable
        className="mt-3"
        rows={sorted.slice(0, visible)}
        rowKey={client => client.name}
        scrollLabel={t('clients.title')}
        columns={[
          {
            key: 'client',
            header: t('clients.columns.client'),
            mobile: 'title',
            render: client => {
              const accountId = linkedAccountIds?.[client.name]
              const name = (
                <span data-testid="market-client-name" className="font-semibold">
                  {client.name}
                </span>
              )
              return (
                <div className="min-w-0">
                  <Text size="sm">{accountId && renderAccountLink ? renderAccountLink(accountId, name) : name}</Text>
                  {client.sector ? (
                    <Text size="xs" className="text-[var(--bellum-text-muted)]">
                      {client.sector}
                    </Text>
                  ) : null}
                </div>
              )
            },
          },
          {
            key: 'size',
            header: t('clients.columns.size'),
            render: client => (client.size ? <Badge variant="default">{readSize(client.size, t)}</Badge> : null),
          },
          {
            key: 'profiles',
            header: t('clients.columns.profiles'),
            render: client => {
              const parts = [
                client.profiles !== undefined
                  ? t('clients.profiles', { count: client.profiles, formatted: formatCount(client.profiles) })
                  : null,
                client.externals !== undefined
                  ? t('clients.externals', { count: client.externals, formatted: formatCount(client.externals) })
                  : null,
              ].filter((part): part is string => part !== null)
              return parts.length > 0 ? <Text size="sm">{parts.join(' · ')}</Text> : null
            },
          },
          {
            key: 'cities',
            header: t('clients.columns.cities'),
            mobile: 'meta',
            render: client => (client.cities.length > 0 ? <span>{client.cities.join(', ')}</span> : null),
          },
          {
            key: 'reading',
            header: t('clients.columns.reading'),
            className: 'min-w-48',
            render: client =>
              client.reading || client.families ? (
                <div className="min-w-0">
                  {client.families ? (
                    <Text size="xs" className="text-[var(--bellum-text-muted)]">
                      {t('clients.families', { families: client.families })}
                    </Text>
                  ) : null}
                  {client.reading ? (
                    <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                      {client.reading}
                    </Text>
                  ) : null}
                </div>
              ) : null,
          },
        ]}
      />
      <ShowMoreButton
        t={t}
        nextCount={nextCount}
        visible={visible}
        total={clients.length}
        onClick={revealMore}
        testId="market-clients-more"
      />
    </Card>
  )
}
