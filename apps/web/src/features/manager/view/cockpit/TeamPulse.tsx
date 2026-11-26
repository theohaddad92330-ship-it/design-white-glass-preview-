import type { ManagerPeriodCount, ManagerPeriodDays, ManagerPulse } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formatCount } from '@/lib/locale'

/**
 * « Pouls de l'équipe » — #4158.39 (lot L7, Louis 14/10/2026).
 *
 * CINQ indicateurs, pas un de plus (principe 3 de la refonte), chacun comparé à
 * la période PRÉCÉDENTE de même longueur, chacun cliquable vers la liste qui
 * porte ses objets.
 *
 * ⚠️ L'écart se dit en TEXTE — une flèche (décorative, `aria-hidden`), un SIGNE
 * et un NOMBRE : « +2 vs les 7 j précédents ». Jamais une couleur seule, et pas
 * de pourcentage : un écart absolu ne divise jamais par zéro, là où « +100 % »
 * sur une base nulle est exactement ce que `TrendLine` refuse d'écrire.
 *
 * ⚠️ Aucune couleur de jugement non plus : « plus d'analyses » n'est pas une
 * bonne nouvelle en soi, et la même tuile sur un autre indicateur dirait le
 * contraire. Le manager lit le sens, l'écran donne le fait.
 *
 * Doctrine : « RDV obtenus » est un geste DÉCLARÉ par le commercial
 * (`user_actions.rdv_obtained`), nommé comme tel — jamais confondu avec un
 * rendez-vous vérifié dans un agenda.
 */
/** Chaque tuile porte SA porte, typée sur sa route (jamais un `search` générique). */
type Tile = {
  key: string
  label: string
  hint?: string
  count: ManagerPeriodCount
  door: (body: ReactNode) => ReactNode
}

const TILE_CLASS =
  'flex h-full min-h-11 flex-col gap-1 rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4 transition-colors hover:bg-[var(--bellum-surface-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--bellum-primary-500)]'

export function TeamPulse({ pulse, days }: { pulse: ManagerPulse; days: ManagerPeriodDays }) {
  const { t } = useTranslation('manager')
  const period = `${days}d` as const

  const tiles: Tile[] = [
    {
      key: 'analyses',
      label: t('board.pulse.analyses'),
      count: pulse.analyses,
      door: body => (
        <Link to="/actions" search={{ category: 'analysis', period }} className={TILE_CLASS}>
          {body}
        </Link>
      ),
    },
    {
      key: 'actions-done',
      label: t('board.pulse.actionsDone'),
      count: pulse.actions_done,
      door: body => (
        <Link to="/actions" search={{ tab: 'done' }} className={TILE_CLASS}>
          {body}
        </Link>
      ),
    },
    {
      key: 'meetings',
      label: t('board.pulse.meetings'),
      hint: t('board.pulse.meetingsHint'),
      count: pulse.meetings_declared,
      door: body => (
        <Link to="/actions" search={{ period }} className={TILE_CLASS}>
          {body}
        </Link>
      ),
    },
    {
      key: 'active-accounts',
      label: t('board.pulse.activeAccounts'),
      count: pulse.active_accounts,
      door: body => (
        <Link to="/accounts" className={TILE_CLASS}>
          {body}
        </Link>
      ),
    },
    {
      key: 'open-needs',
      label: t('board.pulse.openNeeds'),
      hint: t('board.pulse.openNeedsHint'),
      count: pulse.open_needs,
      door: body => (
        <Link to="/projects" className={TILE_CLASS}>
          {body}
        </Link>
      ),
    },
  ]

  return (
    <section aria-label={t('board.pulse.eyebrow')} data-board-block="pulse" className="space-y-3">
      <Text size="xs" weight="semibold" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
        {t('board.pulse.eyebrow')}
      </Text>
      <Text element="h2" size="lg" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t('board.pulse.title', { days })}
      </Text>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map(tile => (
          <li key={tile.key}>
            {tile.door(
              <>
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {tile.label}
                </Text>
                <Text
                  element="span"
                  size="2xl"
                  weight="bold"
                  className="tabular-nums text-[var(--bellum-text-primary)]"
                >
                  {formatCount(tile.count.current)}
                </Text>
                <PeriodDelta count={tile.count} days={days} />
                {/* La précision (« déclarés », « apparus sur la période ») est
                    LUE, pas seulement survolée : un `title` ne se voit ni au
                    doigt ni au lecteur d'écran. */}
                {tile.hint ? (
                  <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                    {tile.hint}
                  </Text>
                ) : null}
              </>,
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function PeriodDelta({ count, days }: { count: ManagerPeriodCount; days: number }) {
  const { t } = useTranslation('manager')
  const diff = count.current - count.previous
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : ArrowRight
  return (
    <Text element="span" size="xs" className="inline-flex items-center gap-1 text-[var(--bellum-text-secondary)]">
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {diff === 0
        ? t('board.period.stable', { days })
        : t('board.period.delta', { sign: diff > 0 ? '+' : '−', value: formatCount(Math.abs(diff)), days })}
    </Text>
  )
}
