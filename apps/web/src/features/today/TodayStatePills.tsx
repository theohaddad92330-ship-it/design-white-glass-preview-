import { FilterChips } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { TODAY_STATE_ORDER, type TodayStateKey } from './todayStates'

/** « Toutes » : l'absence de filtre d'état. « Terminées » ouvre le tiroir « Historique » — ce n'est pas un état de la file. */
type PillValue = TodayStateKey | 'all' | 'done'

/**
 * Théo C actions-aujourdhui.R2 / N2 — les pastilles d'ÉTAT de la file : À traiter · Non commencées · En cours · À valider
 * · Terminées · Toutes. Un état sans ligne ne fait aucune pastille (jamais « 0 », GA-18/19) ; la date reste en bout de ligne.
 */
export function TodayStatePills({
  counts,
  total,
  value,
  onChange,
  onOpenDone,
}: {
  counts: Partial<Record<TodayStateKey, number>>
  total: number
  value: TodayStateKey | null
  onChange: (next: TodayStateKey | null) => void
  onOpenDone: () => void
}) {
  const { t } = useTranslation('actions')
  const options = [
    ...TODAY_STATE_ORDER.flatMap(state =>
      counts[state] ? [{ value: state as PillValue, label: t(`today.states.${state}`), count: counts[state] }] : [],
    ),
    { value: 'done' as PillValue, label: t('today.states.done') },
    { value: 'all' as PillValue, label: t('today.states.all'), count: total },
  ]
  return (
    <FilterChips
      ariaLabel={t('today.states.legend')}
      legend={t('today.states.legend')}
      size="sm"
      options={options}
      value={value ?? 'all'}
      onChange={next => {
        if (next === 'done') return onOpenDone()
        onChange(next === 'all' || next === null ? null : (next as TodayStateKey))
      }}
    />
  )
}
