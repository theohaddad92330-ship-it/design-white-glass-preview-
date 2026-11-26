import { Card, Text } from '@bellum/ui'
import { BriefcaseBusiness, CircleDollarSign, RadioTower, TriangleAlert, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { i18n } from '@/i18n'
import type { WatchSignal } from '@/features/accounts/model/watch'
import type { WatchFilter } from './WatchFilters'

type WatchStat = { key: string; label: string; value: number; detail: string; icon: LucideIcon; opens: WatchFilter }

type WatchOverviewStatsProps = {
  signals: WatchSignal[]
  /** Lignes actuellement affichées par la liste (filtre actif). */
  shownCount: number
  narrowed: boolean
  /** #3680.2 — chaque compteur ouvre la liste qu'il nomme. */
  onOpenCategory: (filter: WatchFilter) => void
}

export function WatchOverviewStats({ signals, shownCount, narrowed, onOpenCategory }: WatchOverviewStatsProps) {
  const { t } = useTranslation('accountWatch')
  return (
    <Card className="gap-0 p-5">
      <Text element="h2" size="sm" weight="semibold">
        {t('stats.title')}
      </Text>
      {/* #3680.2 — filtre actif : « X affichés sur Y », jamais le total seul au-dessus d'une liste filtrée. */}
      {narrowed ? (
        <Text element="p" size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1">
          {/* #3995 — la liste montre tous les signaux du filtre (pistes comprises) : X = ses lignes. */}
          {t('stats.shownOf', { shown: shownCount, total: signals.length })}
        </Text>
      ) : null}
      <div className="mt-4 divide-y divide-[var(--bellum-border)]">
        {buildStats(signals).map(stat => (
          <StatRow key={stat.key} stat={stat} onOpen={() => onOpenCategory(stat.opens)} />
        ))}
      </div>
    </Card>
  )
}

function StatRow({ stat, onOpen }: { stat: WatchStat; onOpen: () => void }) {
  const Icon = stat.icon
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 py-3 text-left first:pt-0 last:pb-0 pointer-coarse:min-h-11"
      data-testid={`watch-stat-${stat.key}`}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--bellum-surface-2)]">
        <Icon className="size-4 text-[var(--bellum-text-accent)]" />
      </div>
      <div className="min-w-0 flex-1">
        <Text size="xs" weight="medium" className="text-[var(--bellum-text-primary)]">
          {stat.label}
        </Text>
        <Text size="xs" className="truncate text-[var(--bellum-text-secondary)]">
          {stat.detail}
        </Text>
      </div>
      <Text size="lg" weight="semibold" className="shrink-0 tabular-nums">
        {stat.value}
      </Text>
    </button>
  )
}

// #2617.1 — les lignes reprennent le même regroupement que
// `WatchFilters.matchesFilter`. #3680.2 — une catégorie SANS événement ne fait
// aucune ligne (une absence n'est pas une ligne) ; la ligne du total reste,
// c'est le total de l'audience : un zéro mesuré peut informer.
function buildStats(signals: WatchSignal[]): WatchStat[] {
  const categories: WatchStat[] = [
    {
      key: 'jobs',
      label: i18n.t('accountWatch:stats.jobs.label'),
      value: count(signals, 'recrutement'),
      detail: i18n.t('accountWatch:stats.jobs.detail'),
      icon: BriefcaseBusiness,
      opens: 'recruitments',
    },
    {
      key: 'budgets',
      label: i18n.t('accountWatch:stats.budgets.label'),
      value: count(signals, 'budget') + count(signals, 'appel_offres') + count(signals, 'marche_public'),
      detail: i18n.t('accountWatch:stats.budgets.detail'),
      icon: CircleDollarSign,
      opens: 'purchases',
    },
    {
      key: 'pains',
      label: i18n.t('accountWatch:stats.pains.label'),
      value: count(signals, 'nomination'),
      detail: i18n.t('accountWatch:stats.pains.detail'),
      icon: TriangleAlert,
      opens: 'organization',
    },
  ]
  return [
    {
      key: 'newSignals',
      label: i18n.t('accountWatch:stats.newSignals.label'),
      value: signals.length,
      detail: i18n.t('accountWatch:stats.newSignals.detail'),
      icon: RadioTower,
      opens: 'all',
    },
    ...categories.filter(stat => stat.value > 0),
  ]
}

function count(signals: WatchSignal[], category: WatchSignal['category']): number {
  return signals.filter(signal => signal.category === category).length
}
