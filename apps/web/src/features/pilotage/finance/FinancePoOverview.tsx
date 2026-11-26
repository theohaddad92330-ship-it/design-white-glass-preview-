import { Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { usePoConsumptionOverview } from '../api'

/**
 * #2783 — LE VOLUME DE BONS DE COMMANDE, à l'échelle de l'ESPACE.
 *
 * `poConsumption`/`poConsumptionAlert` ne se lisaient jusqu'ici que PAR
 * MISSION (`MissionMarginEngine.tsx`) : ce bloc ne recalcule rien, il COMPTE
 * combien de missions suivies par bon de commande sont dans chaque état déjà
 * nommé ailleurs (`PO_CONSUMPTION_ALERTS`).
 *
 * Les avenants comptés sont ceux qui touchent CES MÊMES missions — jamais
 * tous les avenants de l'espace (voir `ForecastHorizonsService.poConsumptionOverview`).
 * COMPTÉS, jamais chiffrés (`new_term` est un JSON libre sans contrat de clé
 * vérifiable — en extraire un montant serait deviner).
 */
export function FinancePoOverview() {
  const { t } = useTranslation('pilotage')
  const overview = usePoConsumptionOverview()

  return (
    <Card className="mt-6 p-4">
      <Text size="sm" weight="semibold">
        {t('finance.poOverview.title')}
      </Text>
      <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
        {t('finance.poOverview.hint')}
      </Text>

      <div className="mt-3">
        {overview.isLoading ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('loading')}
          </Text>
        ) : overview.isError || !overview.data ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('finance.unavailable')}
          </Text>
        ) : (
          <FinancePoOverviewBody overview={overview.data} />
        )}
      </div>
    </Card>
  )
}

function FinancePoOverviewBody({
  overview,
}: {
  overview: {
    ok: number
    approaching: number
    overrun: number
    unmeasured: number
    amendments: { accepted: number; simulated: number }
  }
}) {
  const { t } = useTranslation('pilotage')
  const total = overview.ok + overview.approaching + overview.overrun + overview.unmeasured

  if (total === 0) {
    return (
      <Text size="xs" className="text-[var(--bellum-text-muted)]">
        {t('finance.poOverview.empty')}
      </Text>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="po-overview-buckets">
        {(['overrun', 'approaching', 'ok', 'unmeasured'] as const).map(key => (
          <div key={key}>
            <dt>
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t(`finance.poOverview.buckets.${key}`)}
              </Text>
            </dt>
            <dd>
              <Text size="sm" weight="semibold">
                {overview[key]}
              </Text>
            </dd>
          </div>
        ))}
      </dl>

      {overview.amendments.accepted > 0 || overview.amendments.simulated > 0 ? (
        <Text size="xs" className="block text-[var(--bellum-text-muted)]" data-testid="po-overview-amendments">
          {overview.amendments.accepted > 0
            ? t('finance.poOverview.amendments.accepted', { count: overview.amendments.accepted })
            : null}
          {overview.amendments.accepted > 0 && overview.amendments.simulated > 0 ? ' · ' : null}
          {overview.amendments.simulated > 0
            ? t('finance.poOverview.amendments.simulated', { count: overview.amendments.simulated })
            : null}
        </Text>
      ) : null}
    </div>
  )
}
