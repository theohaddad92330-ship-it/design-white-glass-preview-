import type { MarketBrief } from '@bellum/contracts'
import { Card, Progress, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatCount } from '@/lib/locale'

/**
 * Prix médian par année (barres, comme les graphiques du brief commercial).
 * « Données jusqu'à <dernière année> » est écrit en clair : une série qui
 * s'arrête en 2024 ne se lit pas comme le prix d'aujourd'hui. Aucune année
 * interpolée : seules les années portées par le brief s'affichent.
 */
export function PriceTrend({
  trend,
  currency = 'EUR',
}: {
  trend: NonNullable<MarketBrief['price_trend']>
  currency?: string
}) {
  const { t } = useTranslation('marketBrief')
  if (trend.length === 0) return null
  const points = [...trend].sort((a, b) => a.year - b.year)
  const lastYear = Math.max(...points.map(point => point.year))
  const max = Math.max(...points.map(point => point.median))

  return (
    <Card data-testid="market-price-trend" className="min-w-0 p-4">
      <Text element="h3" size="base" weight="semibold">
        {t('priceTrend.title')}
      </Text>
      <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
        {t('priceTrend.dataUntil', { year: lastYear })}
      </Text>
      <ul className="mt-3 flex flex-col gap-2">
        {points.map(point => (
          <li
            key={point.year}
            data-testid="market-price-trend-year"
            className="grid min-w-0 grid-cols-[3rem_1fr_auto] items-center gap-3"
          >
            <Text size="sm">{point.year}</Text>
            <Progress value={max > 0 ? (point.median / max) * 100 : 0} size="md" aria-label={String(point.year)} />
            <div className="text-right">
              <Text size="sm" weight="medium">
                {t('priceTrend.amount', { amount: formatCount(point.median), currency })}
              </Text>
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('priceTrend.perYear', { count: point.needs, formatted: formatCount(point.needs) })}
              </Text>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
