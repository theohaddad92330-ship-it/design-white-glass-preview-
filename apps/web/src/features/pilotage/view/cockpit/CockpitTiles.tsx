import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { appLocale } from '@/lib/locale'
import { compactEuro } from './cockpit-ui'
import type { CockpitFigures } from './useCockpitFigures'

/**
 * Les quatre tuiles de tête — Pipe ouvert · Affaires gagnées · Profils disponibles
 * · Actions à faire. Toutes en STOCK du jour (les mouvements des sept jours sont
 * dans « Ce qui a bougé »). Chaque tuile est un lien vers l'endroit qui détaille
 * son chiffre ; une valeur illisible dit « Non mesuré », jamais « 0 ».
 */
export function CockpitTiles({ figures }: { figures: CockpitFigures }) {
  const { t } = useTranslation('pilotage')
  const locale = appLocale()
  const unknown = t('objective.notMeasured')
  const tiles = [
    {
      key: 'pipe',
      to: '/pilotage/pipe',
      label: t('cockpit.tiles.pipe'),
      value: figures.pipeOpen === null ? unknown : compactEuro(figures.pipeOpen, locale),
      meta: t('cockpit.tiles.pipeMeta'),
    },
    {
      key: 'won',
      to: '/projects',
      label: t('cockpit.tiles.won'),
      value: figures.won === null ? unknown : compactEuro(figures.won, locale),
      meta: t('cockpit.tiles.wonMeta', {
        month: new Intl.DateTimeFormat(locale, { month: 'long', timeZone: 'UTC' }).format(
          new Date(`${figures.month}-01T00:00:00Z`),
        ),
      }),
    },
    {
      key: 'bench',
      to: '/pilotage/staffing',
      label: t('cockpit.tiles.bench'),
      value: figures.bench === null ? unknown : String(figures.bench),
      meta: t('cockpit.tiles.benchMeta'),
    },
    {
      key: 'actions',
      to: '/actions',
      label: t('cockpit.tiles.actions'),
      value: figures.actions === null ? unknown : String(figures.actions.open),
      meta: t('cockpit.tiles.actionsMeta'),
    },
  ] as const

  return (
    <section aria-label={t('cockpit.tiles.region')} data-testid="cockpit-tiles">
      <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--bellum-border)] bg-[var(--bellum-border)] lg:grid-cols-4">
        {tiles.map(tile => (
          <li key={tile.key} className="bg-[var(--bellum-surface-1)]">
            <Link
              to={tile.to}
              className="block min-h-11 px-5 py-4 hover:bg-[var(--bellum-row-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--bellum-primary-500)]"
            >
              <span className="block text-sm text-[var(--bellum-text-secondary)]">{tile.label}</span>
              <span className="mt-2 block text-3xl font-semibold leading-none tabular-nums text-[var(--bellum-text-primary)] md:text-4xl">
                {tile.value}
              </span>
              <span className="mt-2 block text-xs text-[var(--bellum-text-muted)]">{tile.meta}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
