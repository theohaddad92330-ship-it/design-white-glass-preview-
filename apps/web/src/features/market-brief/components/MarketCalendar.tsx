import type { MarketBrief } from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/** Calendrier du marché : une échéance sans contenu ne fait aucune ligne. */
export function MarketCalendar({ items }: { items: NonNullable<MarketBrief['calendar']> }) {
  const { t } = useTranslation('marketBrief')
  if (items.length === 0) return null
  return (
    <Card data-testid="market-calendar" className="min-w-0 p-4">
      <Text element="h3" size="base" weight="semibold">
        {t('calendar.title')}
      </Text>
      <ul className="mt-3 flex flex-col gap-3">
        {items.map(item => (
          <li key={`${item.label}-${item.when}`} className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <Text size="sm" weight="semibold">
                {item.label}
              </Text>
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {item.when}
              </Text>
            </div>
            {item.actors ? (
              <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
                {t('calendar.actors', { actors: item.actors })}
              </Text>
            ) : null}
            {item.detail ? (
              <Text size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
                {item.detail}
              </Text>
            ) : null}
            {item.source ? (
              <Text size="xs" className="mt-0.5 text-[var(--bellum-text-muted)]">
                {t('calendar.source', { source: item.source })}
              </Text>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  )
}
