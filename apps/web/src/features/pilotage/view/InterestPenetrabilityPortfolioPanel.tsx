import {
  MAX_INTEREST_PENETRABILITY_PORTFOLIO_ACCOUNTS,
  summarizeAccountInterestPenetrabilityPortfolio,
  type AccountInterestPenetrabilityQuadrant,
} from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Compass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAccountInterestPenetrabilityPortfolio } from '@/features/accounts/hooks/useAccountInterestPenetrabilityPortfolio'

/** Trois comptes nommés au plus par quadrant — même discipline que
 *  `WorkspaceLearningPanel` (`MAX_PATTERNS`) : un survol de portefeuille
 *  n'est pas une liste, il montre de quoi il parle et compte le reste. */
const MAX_EXAMPLES_PER_QUADRANT = 3

/**
 * BEL-SC-229 (#3258.13, épopée #3362, lot P01) — LE SURVOL PORTEFEUILLE, sur
 * Pilotage.
 *
 * Le bilan du 29/09 sur #3362 écartait ce point comme « un système à part » :
 * `AccountInterestPenetrabilityService.matrixFor` (et la carte de la fiche
 * compte) ne lisent qu'UN compte à la fois. Ce panneau ne redérive AUCUN
 * quadrant — `summarizeAccountInterestPenetrabilityPortfolio` (contracts) ne
 * fait que COMPTER ce que `deriveAccountInterestPenetrability` a déjà
 * tranché par compte (GA-26).
 *
 * ⚠️ `null` (façade `@Optional()` non montée) : l'écran se TAIT, même
 * discipline que `AccountInterestPenetrabilityCard` sur la fiche compte.
 * Portefeuille VRAIMENT vide (aucun compte dans le périmètre) : ce n'est pas
 * la même chose, et le panneau le dit au lieu de disparaître.
 */
export function InterestPenetrabilityPortfolioPanel() {
  const { t } = useTranslation(['pilotage', 'accountDetail'])
  const { data, isLoading } = useAccountInterestPenetrabilityPortfolio()

  if (isLoading) return null
  if (!data) return null

  const summary = summarizeAccountInterestPenetrabilityPortfolio(data)

  return (
    <Card className="mt-6 p-4">
      <div className="flex items-center gap-2">
        <Compass aria-hidden="true" className="size-4 text-[var(--bellum-text-accent)]" />
        <Text size="sm" weight="semibold">
          {t('pilotage:interestPenetrabilityPortfolio.title')}
        </Text>
      </div>
      <Text size="xs" className="mt-1 block text-[var(--bellum-text-secondary)]">
        {t('pilotage:interestPenetrabilityPortfolio.subtitle')}
      </Text>

      {summary.countedAccounts === 0 ? (
        <Text size="xs" className="mt-3 text-[var(--bellum-text-muted)]">
          {t('pilotage:interestPenetrabilityPortfolio.empty')}
        </Text>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {summary.byQuadrant.map(({ quadrant, count }) => (
            <QuadrantRow key={quadrant} quadrant={quadrant} data={data} summaryCount={count} t={t} />
          ))}
        </div>
      )}

      {summary.unavailable > 0 ? (
        <Text size="xs" className="mt-3 block text-[var(--bellum-text-muted)]">
          {t('pilotage:interestPenetrabilityPortfolio.unavailable', { count: summary.unavailable })}
        </Text>
      ) : null}

      {data.truncated ? (
        <Text size="xs" className="mt-1 block text-[var(--bellum-text-muted)]">
          {t('pilotage:interestPenetrabilityPortfolio.truncated', {
            limit: MAX_INTEREST_PENETRABILITY_PORTFOLIO_ACCOUNTS,
            total: data.totalAccounts,
          })}
        </Text>
      ) : null}
    </Card>
  )
}

function QuadrantRow({
  quadrant,
  data,
  summaryCount,
  t,
}: {
  quadrant: AccountInterestPenetrabilityQuadrant
  data: { entries: { accountId: string; companyName: string; quadrant: AccountInterestPenetrabilityQuadrant | null }[] }
  summaryCount: number
  t: ReturnType<typeof useTranslation>['t']
}) {
  const examples = data.entries.filter(entry => entry.quadrant === quadrant).slice(0, MAX_EXAMPLES_PER_QUADRANT)
  const remaining = summaryCount - examples.length

  return (
    <div className="border-t border-[var(--bellum-border)] pt-2 first:border-0 first:pt-0">
      <div className="flex items-baseline justify-between gap-2">
        <Text size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
          {t(`accountDetail:interestPenetrability.quadrants.${quadrant}`)}
        </Text>
        <Text size="xs" className="shrink-0 tabular-nums text-[var(--bellum-text-muted)]">
          {t('pilotage:interestPenetrabilityPortfolio.accountCount', { count: summaryCount })}
        </Text>
      </div>
      {examples.length > 0 ? (
        <ul className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {examples.map(entry => (
            <li key={entry.accountId}>
              <Link
                to="/accounts/$id"
                params={{ id: entry.accountId }}
                className="rounded-md text-xs text-[var(--bellum-text-accent)] underline-offset-4 hover:underline"
              >
                {entry.companyName}
              </Link>
            </li>
          ))}
          {remaining > 0 ? (
            <li>
              <Text size="xs" className="text-[var(--bellum-text-muted)]">
                {t('pilotage:interestPenetrabilityPortfolio.moreCount', { count: remaining })}
              </Text>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  )
}
