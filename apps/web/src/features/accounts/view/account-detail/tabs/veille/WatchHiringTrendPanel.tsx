import { Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { HiringVolumeMonth } from '@/features/accounts/model/hiringVolumeTrend'

type WatchHiringTrendPanelProps = {
  series: HiringVolumeMonth[]
}

/**
 * #3920 (décision Louis 15/10/2026) — la tendance du compte : le volume d'offres d'emploi par mois, lu sur ce
 * qu'on a collecté. Une série de moins de deux mois datés ne fait AUCUNE ligne (pas de carte vide, pas de « 0 »).
 */
export function WatchHiringTrendPanel({ series }: WatchHiringTrendPanelProps) {
  const { t, i18n } = useTranslation('accountWatch')
  if (series.length < 2) return null
  const max = Math.max(...series.map(entry => entry.count))
  const total = series.reduce((sum, entry) => sum + entry.count, 0)
  const locale = i18n.language === 'en' ? 'en-GB' : 'fr-FR'
  return (
    <Card className="gap-0 p-5" data-testid="watch-hiring-trend">
      <Text element="h2" size="sm" weight="semibold">
        {t('hiringTrend.title')}
      </Text>
      <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1">
        {t('hiringTrend.scope', { count: total, months: series.length })}
      </Text>
      <ul className="mt-3 space-y-2">
        {series.map(entry => {
          const [year, month] = entry.month.split('-').map(Number)
          const label = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, 1)).toLocaleDateString(locale, {
            month: 'short',
            year: '2-digit',
            timeZone: 'UTC',
          })
          return (
            <li key={entry.month} className="flex items-center gap-3">
              <Text size="xs" className="w-16 shrink-0 text-[var(--bellum-text-secondary)]">
                {label}
              </Text>
              <div className="h-2 min-w-0 flex-1 rounded-full bg-[var(--bellum-surface-2)]" aria-hidden="true">
                <div
                  className="h-2 rounded-full bg-[var(--bellum-primary-500)]"
                  style={{ width: `${Math.round((entry.count / max) * 100)}%` }}
                />
              </div>
              <Text size="xs" weight="medium" className="w-6 shrink-0 text-right tabular-nums">
                {entry.count}
              </Text>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
