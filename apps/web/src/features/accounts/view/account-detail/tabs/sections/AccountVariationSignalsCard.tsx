import type { AccountVariationSignal } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * #3920.10 (Louis 15/10/2026) — LES QUATRE SIGNAUX DE VARIATION d'un compte, chacun daté avec sa base.
 * Un pourcentage n'apparaît que si la base précédente est > 0.
 *
 * #3711.17 (décision Louis 17/10/2026, recette R41 : 4 « Non mesuré » hors score sur EDF) — HORS score/axe, une
 * absence ne fait AUCUNE ligne : le bloc ne rend que les variations MESURÉES ; aucune mesurée ⇒ aucun bloc.
 * Un signal non mesuré ne devient jamais « 0 » (GA-19) : il disparaît, il ne se chiffre pas.
 */
export function AccountVariationSignalsCard({ signals }: { signals: AccountVariationSignal[] | null }) {
  const { t, i18n } = useTranslation('accountDetail')
  const measured = (signals ?? []).filter(
    (signal): signal is Extract<AccountVariationSignal, { status: 'measured' }> => signal.status === 'measured',
  )
  if (measured.length === 0) return null
  const fmt = (n: number) => n.toLocaleString(i18n.language)
  return (
    <Box className="space-y-2" data-testid="variation-signals">
      <Text element="h3" size="sm" weight="semibold">
        {t('variation.title')}
      </Text>
      <ul className="space-y-1.5">
        {measured.map(signal => (
          <li key={signal.key} data-testid={`variation-${signal.key}`}>
            <Text element="span" size="sm" weight="medium">
              {t(`variation.keys.${signal.key}`)}
              {' : '}
            </Text>
            <Text element="span" size="sm">
              {t('variation.measured', { current: fmt(signal.current), previous: fmt(signal.previous) })}
              {signal.changePct === null
                ? ''
                : ` · ${signal.changePct >= 0 ? '+' : '−'}${fmt(Math.round(Math.abs(signal.changePct)))} %`}
            </Text>
            <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]" className="block">
              {t(`variation.base.${signal.base.compare}`, { days: signal.base.windowDays, date: signal.base.asOf })}
            </Text>
          </li>
        ))}
      </ul>
    </Box>
  )
}
