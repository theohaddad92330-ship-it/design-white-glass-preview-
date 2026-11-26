import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Pencil, Target } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { QueryLoadError } from '@/components/feedback/QueryLoadError'
import { useSession } from '@/lib/hooks/use-session'
import { pilotageApi } from '../api'
import { compactEuro } from './cockpit/cockpit-ui'

const RING_RADIUS = 52
const RING_LENGTH = 2 * Math.PI * RING_RADIUS

/**
 * Cockpit › « Le cap du mois » — la carte à anneau de Théo : signé, cible déclarée,
 * couverture du pipe et rythme attendu du mois EN COURS. Le serveur calcule le
 * réalisé, le pipe ouvert (non pondéré) et les jours ouvrés ; la cible est la somme
 * des objectifs déclarés (`/team`, onglet Objectifs & affaires).
 *
 * Aucune probabilité. Sans cible déclarée : « Aucun objectif saisi » et un lien vers
 * la saisie — jamais un pourcentage déduit. Un réalisé illisible est « Non mesuré »,
 * il ne dessine pas un anneau vide.
 */
export function MonthObjectiveBlock() {
  const { t, i18n } = useTranslation('pilotage')
  const { user } = useSession()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['pilotage', 'month-objective', user?.id],
    queryFn: pilotageApi.monthObjective,
    enabled: !!user,
    staleTime: 30_000,
  })

  const money = (euros: number) =>
    new Intl.NumberFormat(i18n.language, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(euros)
  const monthLong = data
    ? new Intl.DateTimeFormat(i18n.language, { month: 'long', timeZone: 'UTC' }).format(
        new Date(`${data.month}T00:00:00Z`),
      )
    : ''
  const month = data
    ? new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(`${data.month}T00:00:00Z`),
      )
    : ''
  // « Le cap d’octobre », « Le cap de novembre » : l’élision se décide ici, pas dans la phrase traduite.
  const preposition = i18n.language.startsWith('fr') ? (/^[aeiouyàâéèêîôû]/i.test(monthLong) ? 'd’' : 'de ') : ''
  const notMeasured = t('objective.notMeasured')
  const toObjectives = { to: '/team', search: { onglet: 'objectifs' } } as const

  const percent =
    data && data.target !== null && data.target > 0 && data.realised !== null
      ? Math.min(100, Math.round((data.realised / data.target) * 100))
      : null

  return (
    <section
      aria-labelledby="cockpit-objective"
      data-testid="cockpit-cap"
      className="rounded-2xl border border-[var(--accent-soft-border)] bg-[var(--accent-soft-bg)] p-5 md:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="cockpit-objective" className="text-lg font-semibold text-[var(--bellum-text-primary)]">
          {t('objective.capTitle', { month: monthLong, preposition })}
        </h2>
        <Target aria-hidden className="size-4 text-[var(--accent-soft-text)]" />
      </div>
      <span className="sr-only">{month}</span>

      {isLoading ? (
        <p className="mt-4 text-sm text-[var(--bellum-text-muted)]">{t('objective.loading')}</p>
      ) : isError || !data ? (
        <div className="mt-4">
          <QueryLoadError />
        </div>
      ) : data.target === null ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm text-[var(--bellum-text-secondary)]">{t('objective.none')}</p>
          <Link
            {...toObjectives}
            className="inline-flex min-h-11 items-center text-sm font-medium text-[var(--bellum-text-accent)] underline"
          >
            {t('objective.noneLink')}
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-4">
            {percent === null ? null : (
              <div role="img" aria-label={t('objective.ringLabel', { percent })} className="relative size-36 shrink-0">
                <svg viewBox="0 0 120 120" className="size-full -rotate-90">
                  <circle
                    cx="60"
                    cy="60"
                    r={RING_RADIUS}
                    strokeWidth="10"
                    className="fill-none stroke-[var(--bellum-border)]"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r={RING_RADIUS}
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={RING_LENGTH}
                    strokeDashoffset={RING_LENGTH * (1 - percent / 100)}
                    className="fill-none stroke-[var(--bellum-primary-500)]"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-semibold tabular-nums text-[var(--bellum-text-primary)]">
                    {percent}%
                  </span>
                  <span className="max-w-[6rem] text-xs text-[var(--bellum-text-secondary)]">
                    {t('objective.ringCaption')}
                  </span>
                </div>
              </div>
            )}
            <dl className="grid gap-4">
              <div>
                <dt className="text-sm text-[var(--bellum-text-secondary)]">{t('objective.signedThisMonth')}</dt>
                <dd className="text-2xl font-semibold tabular-nums text-[var(--bellum-text-primary)]">
                  {data.realised === null ? notMeasured : compactEuro(data.realised, i18n.language)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--bellum-text-secondary)]">{t('objective.target')}</dt>
                <dd className="text-2xl font-semibold tabular-nums text-[var(--bellum-text-primary)]">
                  {compactEuro(data.target, i18n.language)}
                </dd>
              </div>
            </dl>
          </div>

          <p className="mt-5 text-sm text-[var(--bellum-text-primary)]">
            {data.remaining === 0
              ? t('objective.coverageNone')
              : data.coverage === null
                ? t('objective.coverageUnknown')
                : t('objective.coverageLine', {
                    ratio: new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 1 }).format(data.coverage),
                    pace:
                      data.expectedPacePerDay === null
                        ? notMeasured
                        : t('objective.paceValue', { amount: money(data.expectedPacePerDay) }),
                  })}
          </p>
          <p className="sr-only">
            {t('objective.targetHint', { month })} {t('objective.realisedHint', { month })}{' '}
            {data.openPipe !== null && data.remaining !== null && data.remaining > 0
              ? t('objective.coverageHint', { pipe: money(data.openPipe), remaining: money(data.remaining) })
              : t('objective.remainingHint')}{' '}
            {t('objective.paceHint', { days: data.workingDaysLeft, month })}
          </p>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--accent-soft-border)] pt-4 text-sm">
            <span className="flex items-center gap-2 text-[var(--bellum-text-primary)]">
              {data.remaining !== null && data.remaining > 0
                ? t('objective.toReach', { amount: compactEuro(data.remaining, i18n.language) })
                : t('objective.reached')}
              <Link
                {...toObjectives}
                aria-label={t('objective.edit')}
                className="inline-flex size-11 items-center justify-center rounded-lg text-[var(--bellum-text-secondary)] hover:text-[var(--bellum-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
              >
                <Pencil aria-hidden className="size-4" />
              </Link>
            </span>
            <Link
              {...toObjectives}
              className="inline-flex min-h-11 items-center gap-1.5 font-medium text-[var(--bellum-text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
            >
              {t('objective.detail')}
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        </>
      )}
    </section>
  )
}
