import { Button, Card, DotIndicator, Text, cn } from '@bellum/ui'
import { Maximize2, Info, Minimize2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { countSites, countUnplottedSites } from './siteGeo'
import { D3FranceMap } from './D3FranceMap'
import { SITE_CATEGORY_STYLES } from './siteStyles'
import type { SiteRow } from './siteTypes'

type FranceMapPanelProps = {
  rows: SiteRow[]
  /** #4326 — toutes les villes (placées ou non) : le résumé dit le vrai total. */
  allRows: SiteRow[]

  expanded: boolean
  onToggleExpanded: () => void
}

export function FranceMapPanel(props: FranceMapPanelProps) {
  const { rows, allRows, expanded, onToggleExpanded } = props
  // #4326.1 — des SITES non placés (pas des villes) : l'écran dit combien d'établissements manquent à la carte.
  const unplotted = countUnplottedSites(allRows)

  return (
    <Card className="flex h-full min-h-[620px] flex-col overflow-hidden p-0 [--card-spacing:0px]">
      <MapHeader expanded={expanded} onToggleExpanded={onToggleExpanded} />
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-[var(--bellum-bg-lighter)] px-3 py-3 dark:bg-[color-mix(in_srgb,var(--bellum-bg)_78%,black)]">
        <D3FranceMap rows={rows} expanded={expanded} />
        <MapLegend />
      </div>
      <MapSummary sites={countSites(allRows)} cities={allRows.length} unplotted={unplotted} />
    </Card>
  )
}

function MapHeader({ expanded, onToggleExpanded }: { expanded: boolean; onToggleExpanded: () => void }) {
  const { t } = useTranslation('accountSites')
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--bellum-border)] px-5 py-4">
      <div className="flex items-center gap-2">
        <Text size="sm" weight="semibold">
          {t('map.title')}
        </Text>
        <Info className="size-4 text-[var(--bellum-text-muted)]" />
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={onToggleExpanded}
          icon={expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          className="gap-2 active:scale-[0.98]"
        >
          {expanded ? t('map.collapse') : t('map.expand')}
        </Button>
      </div>
    </div>
  )
}

function MapLegend() {
  const { t } = useTranslation('accountSites')
  return (
    <div className="absolute bottom-4 left-4 rounded-xl border border-[var(--bellum-border)] bg-[color-mix(in_srgb,var(--bellum-bg)_88%,transparent)] p-3 shadow-sm backdrop-blur dark:bg-[color-mix(in_srgb,var(--bellum-bg)_72%,black)]">
      <div className="space-y-2">
        {Object.entries(SITE_CATEGORY_STYLES).map(([key, style]) => (
          <div key={key} className="flex items-center gap-2">
            <DotIndicator className={cn('size-2.5 rounded-full', style.dot)} />
            <Text size="xs" className="text-[var(--bellum-text-primary)]">
              {/* i18n keys: categories.headquarters | categories.office | categories.establishment | categories.industrial */}
              {t(`categories.${key}`)}
            </Text>
          </div>
        ))}
      </div>
    </div>
  )
}

function MapSummary({ sites, cities, unplotted }: { sites: number; cities: number; unplotted: number }) {
  const { t } = useTranslation('accountSites')
  return (
    <div className="border-t border-[var(--bellum-border)] px-5 py-3">
      <Text size="xs" className="text-[var(--bellum-text-secondary)]">
        {t('map.summary', { sites, cities })}
      </Text>
      {unplotted > 0 ? (
        <Text size="xs" className="text-[var(--bellum-text-muted)]">
          {t('map.unplotted', { count: unplotted })}
        </Text>
      ) : null}
    </div>
  )
}
