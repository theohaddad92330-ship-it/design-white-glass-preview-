import type { CrmCountersResponse } from '@bellum/contracts'
import { FilterChips } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { ENDING_HORIZONS, type EndingHorizon } from '../ending-horizon'

const COUNTER_KEY = {
  30: 'missions_ending_30',
  60: 'missions_ending_60',
  90: 'missions_ending_90',
} as const satisfies Record<EndingHorizon, keyof CrmCountersResponse['counters']>

/**
 * #4197 (L6) — « Fin sous 30 j · 60 j · 90 j », les trois puces VISIBLES d'emblée
 * sur `/missions` (et non sous « Filtres »).
 *
 * Les nombres viennent de `GET /crm-counters` (`useCrmCounters`, #4193) et ne
 * sont jamais recomptés ici (garde `one-counter-one-source`). Un compteur non
 * mesuré — ou pas encore reçu — n'affiche AUCUN nombre : jamais « 0 ».
 * La puce filtre quand même la liste (le filtre lit les lignes, pas le compteur).
 */
export function MissionEndingChips({
  counters,
  selected,
  onSelect,
}: {
  counters: CrmCountersResponse['counters'] | undefined
  selected: EndingHorizon | null
  onSelect: (next: EndingHorizon | null) => void
}) {
  const { t } = useTranslation('missions')
  return (
    <FilterChips
      clearable
      size="sm"
      ariaLabel={t('endingChips.label')}
      options={ENDING_HORIZONS.map(days => ({
        value: String(days),
        label: t('endingChips.within', { days }),
        count: counters?.[COUNTER_KEY[days]]?.value ?? undefined,
      }))}
      value={selected === null ? null : String(selected)}
      onChange={next => onSelect(ENDING_HORIZONS.find(days => String(days) === next) ?? null)}
    />
  )
}
