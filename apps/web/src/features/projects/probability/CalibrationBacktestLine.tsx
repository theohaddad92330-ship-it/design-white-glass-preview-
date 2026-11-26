import type { CalibrationBacktest } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * #4016.1c — LE CALIBRAGE MESURÉ A POSTERIORI : l'écart de Brier du rétro-test
 * (chaque affaire close laissée de côté), SA RÉFÉRENCE (prédire toujours le taux
 * de base) et la courbe de fiabilité case par case. Sans assez d'affaires
 * closes : « non mesuré », jamais 0. Une case vide ne s'affiche pas.
 */
export function CalibrationBacktestLine({ backtest }: { backtest: CalibrationBacktest }) {
  const { t, i18n } = useTranslation('projects')
  const number = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 2, minimumFractionDigits: 2 })
  const percent = new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 0 })
  if (backtest.brier === null || backtest.baseline_brier === null) {
    return (
      <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
        {t('probability.backtest.notMeasured')}
      </Text>
    )
  }
  return (
    <Box className="flex flex-col gap-1">
      <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
        {t('probability.backtest.measured', {
          count: backtest.evaluated,
          brier: number.format(backtest.brier),
          baseline: number.format(backtest.baseline_brier),
        })}
      </Text>
      <ul className="flex flex-col">
        {backtest.bins
          .filter(bin => bin.count > 0 && bin.mean_predicted !== null && bin.observed_rate !== null)
          .map(bin => (
            <li key={bin.from}>
              <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                {t('probability.backtest.bin', {
                  count: bin.count,
                  predicted: percent.format((bin.mean_predicted as number) * 100),
                  observed: percent.format((bin.observed_rate as number) * 100),
                })}
              </Text>
            </li>
          ))}
      </ul>
    </Box>
  )
}
