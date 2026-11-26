import type { ProbableQuarter } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatCents } from '@/lib/money'
import { useProbableQuarter } from './useProbableQuarter'
import { CalibratedProbabilityView } from './CalibratedProbabilityView'
import { CalibrationBacktestLine } from './CalibrationBacktestLine'

/**
 * #4016 L1 — le CA PROBABLE du trimestre, sur `/projects`. Le total (par
 * devise, avec son intervalle), puis chaque affaire datée dans le trimestre avec
 * sa probabilité calibrée et ses axes. Ce qui n'est pas chiffrable est COMPTÉ à
 * part — jamais lu « 0 € ».
 */
export function ProbableQuarterPanel() {
  const { data } = useProbableQuarter()
  if (!data) return null
  return <ProbableQuarterPanelView data={data} />
}

export function ProbableQuarterPanelView({ data }: { data: ProbableQuarter }) {
  const { t } = useTranslation('projects')
  const { revenue } = data
  return (
    <section
      aria-labelledby="probable-quarter-title"
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4"
    >
      <Text element="h2" id="probable-quarter-title" size="sm" weight="semibold">
        {t('probability.title')}
      </Text>
      {revenue.totals === null ? (
        <UnknownValue reason={data.deals.length === 0 ? t('probability.empty') : t('probability.noTotal')} />
      ) : (
        <Box display="flex" className="flex-wrap gap-4">
          {revenue.totals.map(total => (
            <Box key={total.currency} className="flex min-w-0 flex-col">
              <Text element="span" size="2xl" weight="semibold">
                {formatCents(total.expected_cents, total.currency)}
              </Text>
              <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                {t('probability.range', {
                  low: formatCents(total.low_cents, total.currency),
                  high: formatCents(total.high_cents, total.currency),
                  count: total.deals,
                })}
              </Text>
            </Box>
          ))}
        </Box>
      )}
      {revenue.without_probability > 0 ? (
        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('probability.withoutProbability', { count: revenue.without_probability })}
        </Text>
      ) : null}
      {revenue.without_amount > 0 ? (
        <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('probability.withoutAmount', { count: revenue.without_amount })}
        </Text>
      ) : null}
      {data.deals.length > 0 ? (
        <ul className="flex flex-col divide-y divide-[var(--bellum-border)]">
          {data.deals.map(deal => (
            <li key={deal.opportunity_id} className="flex flex-col gap-1 py-2 md:flex-row md:justify-between md:gap-4">
              <Box className="min-w-0">
                <Text element="span" size="sm" weight="medium">
                  {deal.label}
                </Text>
                {deal.amount_cents !== null ? (
                  <Text element="span" size="xs" className="block text-[var(--bellum-text-muted)]">
                    {formatCents(deal.amount_cents, deal.currency ?? 'EUR')}
                  </Text>
                ) : null}
              </Box>
              <CalibratedProbabilityView probability={deal.closing_probability} />
            </li>
          ))}
        </ul>
      ) : null}
      <CalibrationBacktestLine backtest={data.calibration} />
    </section>
  )
}
