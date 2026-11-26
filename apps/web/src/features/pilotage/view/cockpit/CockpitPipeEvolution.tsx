import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { appLocale } from '@/lib/locale'
import { usePipeWaterfall } from '../../pipe/api'
import { CARD, compactEuro } from './cockpit-ui'

/**
 * « Évolution du pipe » — la carte de gauche de la rangée « Évolution / Où se situe la
 * décision » de Théo. La maquette trace une courbe sur trois mois ; l'API ne sert pas de
 * série mensuelle, elle sert le waterfall NON PONDÉRÉ d'une période (`/pilotage/pipe/waterfall`,
 * la même lecture que Pilotage › Pipe, jamais recalculée). La carte montre donc ce qui se
 * lit vraiment : le pipe au début de la période, le pipe aujourd'hui, et ce qui l'a fait
 * bouger (créé, signé, perdu). Aucune projection, aucun point inventé entre les deux.
 *
 * Rien d'ouvert ni au début ni à la fin : aucune carte (une absence ne fait aucune ligne).
 */
export function CockpitPipeEvolution() {
  const { t } = useTranslation('pilotage')
  const { data, isLoading, isError } = usePipeWaterfall()
  if (isLoading || isError || !data) return null
  if (data.openingCount === 0 && data.closingCount === 0) return null

  const locale = appLocale()
  const day = (iso: string) =>
    new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso))
  const bars = [
    { key: 'opening', label: t('cockpit.evolution.opening', { date: day(data.from) }), cents: data.openingCents },
    { key: 'closing', label: t('cockpit.evolution.closing', { date: day(data.to) }), cents: data.closingCents },
  ] as const
  const max = Math.max(...bars.map(bar => bar.cents), 1)
  const moves = [
    { key: 'created', cents: data.createdCents },
    { key: 'signed', cents: data.signedCents },
    { key: 'lost', cents: data.lostCents },
  ].filter(move => move.cents > 0)

  return (
    <section aria-labelledby="cockpit-evolution" data-testid="cockpit-evolution" className={`${CARD} flex flex-col`}>
      <h2 id="cockpit-evolution" className="text-lg font-semibold text-[var(--bellum-text-primary)]">
        {t('cockpit.evolution.title')}
      </h2>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-xs text-[var(--bellum-text-muted)]">
        <span>{t('cockpit.evolution.unit')}</span>
        <span>{`${day(data.from)} → ${day(data.to)}`}</span>
      </div>
      <ul className="mt-5 space-y-4">
        {bars.map(bar => (
          <li key={bar.key} className="grid grid-cols-[minmax(7rem,9rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="text-[var(--bellum-text-secondary)]">{bar.label}</span>
            <span aria-hidden className="h-3 overflow-hidden rounded-full bg-[var(--bellum-surface-2)]">
              <span
                className={
                  bar.key === 'closing'
                    ? 'block h-full rounded-full bg-[var(--bellum-primary-500)]'
                    : 'block h-full rounded-full bg-[var(--bellum-text-muted)]'
                }
                style={{ width: `${Math.max(4, Math.round((bar.cents / max) * 100))}%` }}
              />
            </span>
            <span className="min-w-14 text-right font-semibold tabular-nums text-[var(--bellum-text-primary)]">
              {compactEuro(bar.cents / 100, locale)}
            </span>
          </li>
        ))}
      </ul>
      {moves.length > 0 ? (
        <p className="mt-4 text-sm text-[var(--bellum-text-secondary)]">
          {moves
            .map(move => t(`cockpit.evolution.moves.${move.key}`, { amount: compactEuro(move.cents / 100, locale) }))
            .join(' · ')}
        </p>
      ) : null}
      {data.withoutAmountCount > 0 ? (
        <p className="mt-2 text-xs text-[var(--bellum-text-muted)]">
          {t('cockpit.evolution.withoutAmount', { count: data.withoutAmountCount })}
        </p>
      ) : null}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--bellum-border)] pt-4 text-xs text-[var(--bellum-text-muted)]">
        <span className="inline-flex items-center gap-2">
          <i aria-hidden className="block h-1.5 w-4 rounded-full bg-[var(--bellum-primary-500)]" />
          {t('cockpit.evolution.legend')}
        </span>
        <span>{t('cockpit.evolution.notCash')}</span>
      </div>
      <Link
        to="/pilotage/pipe"
        className="inline-flex min-h-11 items-center self-start text-sm font-medium text-[var(--bellum-text-accent)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]"
      >
        {t('cockpit.evolution.open')}
      </Link>
    </section>
  )
}
