import { Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, Input, SelectField } from '@bellum/ui'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'
import {
  FRANCE_ZONE,
  HISTORY_PERIODS,
  type HistorySort,
  HISTORY_VOLUMES,
  type HistoryFacet,
  type HistoryFilters,
  type HistoryPeriod,
  type HistoryVolume,
} from '../model/history-filters'

const SORT_LABEL = {
  relevance: 'toolbar.sortRelevance',
  recent: 'toolbar.sortRecent',
  oldest: 'toolbar.sortOldest',
} as const

type Props = {
  filters: HistoryFilters
  onChange: (next: HistoryFilters) => void
  techs: readonly HistoryFacet[]
  families: readonly HistoryFacet[]
  sectors: readonly HistoryFacet[]
  sources: readonly HistoryFacet[]
  zones: readonly HistoryFacet[]
  active: boolean
  onReset: () => void
}

/**
 * #4756 — LA BARRE DE L'HISTORIQUE : chercher dans l'intitulé, puis CROISER techno × zone × période × volume.
 *
 * Les listes ne proposent que ce que les besoins passés portent (une région sans offre n'est pas un choix) ;
 * « France » est un palier explicite, jamais posé tout seul. À 390 px les champs passent à la ligne, chacun pleine
 * largeur : rien n'est replié derrière un bouton.
 */
export function HistoryFiltersBar({
  filters,
  onChange,
  techs,
  families,
  sectors,
  sources,
  zones,
  active,
  onReset,
}: Props) {
  const { t } = useTranslation('signalsLibrary')
  const { t: tDiscover } = useTranslation('discover')
  const patch = (next: Partial<HistoryFilters>) => onChange({ ...filters, ...next })
  const field = 'min-w-0 basis-full sm:basis-44 sm:flex-1'
  const hasQuery = filters.query.trim() !== ''
  const sortOptions: HistorySort[] = hasQuery ? ['relevance', 'recent', 'oldest'] : ['recent', 'oldest']
  const shownSort: HistorySort =
    filters.sort === 'relevance' && !hasQuery ? 'recent' : (filters.sort ?? (hasQuery ? 'relevance' : 'recent'))

  return (
    <div role="search" aria-label={t('history.filters.aria')} className={`${PAGE_GUTTER_X} flex flex-wrap gap-2`}>
      <label className="flex min-h-11 min-w-0 flex-1 basis-full items-center gap-2 rounded-control border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] px-3">
        <Search className="size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
        <Input
          type="search"
          value={filters.query}
          onChange={event => patch({ query: event.target.value })}
          placeholder={t('history.filters.searchPlaceholder')}
          aria-label={t('history.filters.searchAria')}
          className="min-h-10 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
        />
      </label>
      <div className={field}>
        <SelectField
          ariaLabel={t('history.sortAria')}
          // Lot 768 — « Pertinence » n'existe qu'avec une requête ; sans choix, elle est le défaut dès qu'on cherche.
          value={shownSort}
          onChange={sort => patch({ sort: sort as HistorySort })}
          options={sortOptions.map(sort => ({ value: sort, label: t(SORT_LABEL[sort]) }))}
        />
      </div>
      {techs.length > 0 ? (
        <div className={field}>
          <SelectField
            ariaLabel={t('history.filters.techAria')}
            value={filters.tech}
            onChange={tech => patch({ tech })}
            emptyOption={{ label: t('history.filters.techAll') }}
            options={techs.map(tech => ({ value: tech.value, label: `${tech.value} (${tech.count})` }))}
          />
        </div>
      ) : null}
      {families.length > 0 ? (
        <div className={field}>
          <SelectField
            ariaLabel={t('history.filters.familyAria')}
            value={filters.family}
            onChange={family => patch({ family })}
            emptyOption={{ label: t('history.filters.familyAll') }}
            options={families.map(family => ({
              value: family.value,
              label: `${tDiscover(`rail.jobFamily.${family.value}`)} (${family.count})`,
            }))}
          />
        </div>
      ) : null}
      <div className={field}>
        <SelectField
          ariaLabel={t('history.filters.zoneAria')}
          value={filters.zone ?? ''}
          onChange={zone => patch({ zone: zone === '' ? null : zone })}
          emptyOption={{ label: t('history.filters.zoneAll') }}
          options={[
            ...zones.map(zone => ({ value: zone.value, label: `${t(`history.zones.${zone.value}`)} (${zone.count})` })),
            // #4816 — « France » n'est proposée que si au moins un besoin passé porte une région (facette vide = pas de choix).
            ...(zones.length > 0 ? [{ value: FRANCE_ZONE, label: t('history.zones.france') }] : []),
          ]}
        />
      </div>
      <div className={field}>
        <SelectField
          ariaLabel={t('history.filters.periodAria')}
          value={filters.period ?? ''}
          onChange={period => patch({ period: period === '' ? null : (period as HistoryPeriod) })}
          emptyOption={{ label: t('history.filters.periodAll') }}
          options={HISTORY_PERIODS.map(period => ({ value: period, label: t(`history.periods.${period}`) }))}
        />
      </div>
      <div className={field}>
        <SelectField
          ariaLabel={t('history.filters.volumeAria')}
          value={filters.minVolume === null ? '' : String(filters.minVolume)}
          onChange={volume => patch({ minVolume: volume === '' ? null : (Number(volume) as HistoryVolume) })}
          emptyOption={{ label: t('history.filters.volumeAll') }}
          options={HISTORY_VOLUMES.map(volume => ({
            value: String(volume),
            label: t('history.volumes', { count: volume }),
          }))}
        />
      </div>
      {sectors.length > 0 ? (
        <div className={field}>
          <SelectField
            ariaLabel={t('history.filters.sectorAria')}
            value={filters.sector}
            onChange={sector => patch({ sector })}
            emptyOption={{ label: t('history.filters.sectorAll') }}
            options={sectors.map(sector => ({ value: sector.value, label: `${sector.value} (${sector.count})` }))}
          />
        </div>
      ) : null}
      {sources.length > 0 ? (
        <div className={field}>
          <SelectField
            ariaLabel={t('history.filters.sourceAria')}
            value={filters.source}
            onChange={source => patch({ source })}
            emptyOption={{ label: t('history.filters.sourceAll') }}
            options={sources.map(source => ({ value: source.value, label: `${source.value} (${source.count})` }))}
          />
        </div>
      ) : null}
      {active ? (
        <Button type="button" variant="ghost" className="min-h-11" onClick={onReset}>
          {t('history.filters.reset')}
        </Button>
      ) : null}
    </div>
  )
}
