import { Link } from '@tanstack/react-router'
import { ArrowRight, Wallet } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { appLocale } from '@/lib/locale'
import { CARD, compactEuro } from './cockpit-ui'
import type { CockpitFigures } from './useCockpitFigures'

/**
 * « De la mission à l'encaissement » — trois montants du mois (encaissés · à suivre ·
 * en brouillon), lus dans la MÊME lecture que Finance (`invoice-readiness`, jamais
 * recalculée). Le pipe commercial n'est pas un encaissement : la carte le dit, les
 * deux restent séparés. « Retrouver les factures » ouvre Finance.
 *
 * Un montant qu'aucune ligne ne chiffre est « Non mesuré », jamais « 0 € ».
 * Aucune facture sur le mois : la carte le dit en une phrase, sans trois zéros.
 */
export function CockpitCash({ figures }: { figures: CockpitFigures }) {
  const { t } = useTranslation('pilotage')
  const locale = appLocale()
  const month = new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${figures.month}-01T00:00:00Z`),
  )
  const unknown = t('objective.notMeasured')
  const euros = (value: number | null) => (value === null ? unknown : compactEuro(value, locale))
  const cash = figures.cash

  const columns = cash
    ? ([
        { key: 'collected', value: cash.collected, tone: 'bg-[var(--bellum-success)]' },
        { key: 'toFollow', value: cash.toFollow, tone: 'bg-[var(--bellum-warning)]' },
        { key: 'drafts', value: cash.drafts, tone: 'bg-[var(--bellum-text-muted)]' },
      ] as const)
    : []

  return (
    <section aria-labelledby="cockpit-cash" data-testid="cockpit-cash" className={`${CARD} flex flex-col`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="cockpit-cash" className="text-lg font-semibold text-[var(--bellum-text-primary)]">
          {t('cockpit.cash.title')}
        </h2>
        <Wallet aria-hidden className="size-4 text-[var(--bellum-text-muted)]" />
      </div>
      <p className="mt-2 text-sm text-[var(--bellum-text-secondary)]">{t('cockpit.cash.period', { month })}</p>

      {figures.cashLoading ? (
        <p className="mt-4 text-sm text-[var(--bellum-text-muted)]">{t('loading')}</p>
      ) : cash === null ? (
        <p className="mt-4 text-sm text-[var(--bellum-text-secondary)]">{t('cockpit.cash.none', { month })}</p>
      ) : (
        <dl className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {columns.map(column => (
            <div key={column.key}>
              <span aria-hidden className={`mb-2 block size-2 rounded-full ${column.tone}`} />
              <dd className="text-xl font-semibold tabular-nums text-[var(--bellum-text-primary)] md:text-2xl">
                {euros(column.value)}
              </dd>
              <dt className="mt-1 text-xs text-[var(--bellum-text-muted)]">{t(`cockpit.cash.${column.key}`)}</dt>
            </div>
          ))}
        </dl>
      )}

      <p className="mt-5 text-sm text-[var(--bellum-text-secondary)]">{t('cockpit.cash.separate')}</p>
      <Link
        to="/pilotage/finance"
        className="mt-auto inline-flex min-h-11 items-center gap-1.5 pt-3 text-sm font-medium text-[var(--bellum-text-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
      >
        {t('cockpit.cash.invoices')}
        <ArrowRight aria-hidden className="size-4" />
      </Link>
    </section>
  )
}
