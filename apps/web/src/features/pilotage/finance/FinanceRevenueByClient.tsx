import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { UnknownValue } from '@/components/primitives/UnknownValue'
import { formatCents } from '@/lib/money'
import type { averageDailyRate, financeRevenueByClient } from './finance-mission-revenue'

type ByClient = ReturnType<typeof financeRevenueByClient>
type Rate = ReturnType<typeof averageDailyRate>

/** Le CA par CLIENT (somme du CA par mission) et le TJM moyen, avec sa base. */
export function FinanceRevenueByClient({ byClient, rate }: { byClient: ByClient; rate: Rate }) {
  const { t } = useTranslation(['pilotage', 'missions'])
  return (
    <div className="flex flex-col gap-3">
      {byClient.groups.length > 0 ? (
        <ul className="flex flex-col">
          {byClient.groups.map(group => (
            <li
              key={group.client}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border py-1.5 last:border-b-0"
            >
              <span className="min-w-0">
                <Text size="sm" weight="medium" className="block">
                  {group.client}
                </Text>
                <Text size="xs" className="block text-[var(--bellum-text-muted)]">
                  {t('finance.revenueByClient.missions', { count: group.missions })}
                  {group.withoutAmount > 0 ? ` · ${t('finance.floor', { count: group.withoutAmount })}` : ''}
                </Text>
              </span>
              {group.amountCents === null ? (
                <UnknownValue reason={t('missions:collections.noAmount')} />
              ) : (
                <Text size="sm" weight="semibold">
                  {formatCents(group.amountCents)}
                </Text>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {byClient.withoutClient > 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('finance.revenueByClient.withoutClient', { count: byClient.withoutClient })}
        </Text>
      ) : null}
      {rate.averageCents !== null ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <span className="min-w-0">
            <Text size="xs" className="block text-[var(--bellum-text-secondary)]">
              {t('finance.revenueByClient.averageRate')}
            </Text>
            <Text size="xs" className="block text-[var(--bellum-text-muted)]">
              {t('finance.revenueByClient.rateBase', { measured: rate.measured, count: rate.missions })}
            </Text>
          </span>
          <Text size="sm" weight="semibold">
            {formatCents(rate.averageCents)}
          </Text>
        </div>
      ) : null}
      <Link
        to="/missions/suivi"
        aria-label={t('finance.detailAria', { title: t('finance.revenueByClient.title') })}
        className="inline-flex w-fit items-center rounded-md text-xs text-[var(--bellum-text-accent)] underline underline-offset-4 hover:no-underline pointer-coarse:min-h-11"
      >
        {t('finance.detail')}
      </Link>
    </div>
  )
}
