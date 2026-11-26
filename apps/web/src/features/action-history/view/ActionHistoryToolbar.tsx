import { AddFilterButton, Box, Button, Text, type FilterDefinition } from '@bellum/ui'
import { CalendarDays, History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { PAGE_GUTTER_X } from '@/components/page/page-gutter'

type ActionHistoryToolbarProps = {
  /** Fournies par la page : elles dépendent des membres chargés, que la barre
   *  d'outils n'a aucune raison d'aller chercher elle-même. */
  definitions: FilterDefinition[]
  onAddFilter: (filterId: string, value: string) => void
  hasActiveFilters: boolean
  /**
   * Le mode « depuis ma dernière connexion » (§8) — un DELTA temporel, pas une
   * catégorie. Il vivait dans un troisième rang d'onglets (§L4, 30/08/2026),
   * empilé sous la même forme que la navigation de section alors qu'il ne
   * faisait QUE filtrer. Il devient un bouton BASCULE ici, à côté des autres
   * filtres : les filtres ordinaires n'ont aucun sens dans ce mode et
   * disparaissent tant qu'il est actif.
   */
  isSinceMode: boolean
  onToggleSince: () => void
}

export function ActionHistoryToolbar({
  definitions,
  onAddFilter,
  hasActiveFilters,
  isSinceMode,
  onToggleSince,
}: ActionHistoryToolbarProps) {
  const { t } = useTranslation('actions')
  return (
    <Box display="flex" className={`flex-wrap items-center justify-between gap-3 ${PAGE_GUTTER_X}`}>
      <div>
        <Text size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
          {t('toolbar.title')}
        </Text>
        <Text size="xs" className="mt-0.5 text-[var(--bellum-text-secondary)]">
          {t('toolbar.subtitle')}
        </Text>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button
          variant={isSinceMode ? 'default' : 'outline'}
          size="sm"
          icon={History}
          aria-pressed={isSinceMode}
          onClick={onToggleSince}
        >
          {t('tabs.since')}
        </Button>
        {isSinceMode ? null : (
          <>
            <Button variant="outline" size="sm" icon={CalendarDays} onClick={() => onAddFilter('period', '7d')}>
              {t('filters.last7Days')}
            </Button>
            <AddFilterButton definitions={definitions} onAdd={onAddFilter} hasActive={hasActiveFilters} />
          </>
        )}
      </div>
      {!isSinceMode && !hasActiveFilters ? <span className="sr-only">{t('toolbar.noActiveFilters')}</span> : null}
    </Box>
  )
}
