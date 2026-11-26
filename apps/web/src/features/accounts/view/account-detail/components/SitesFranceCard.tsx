import { Box, Card, Text, cn } from '@bellum/ui'
import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FranceMapPanel } from './sites/FranceMapPanel'
import { SiteSidebar } from './sites/SiteSidebar'
import { SitesTable } from './sites/SitesTable'
import type { SiteRow } from './sites/siteTypes'

type SitesFranceCardProps = {
  /** Already merged and category-filtered by the tab — this component never
   *  derives its own list, so the table can't disagree with the counters. */
  rows: SiteRow[]
  /** #4326 — tous les sites (toutes pages), pour la carte. */
  allRows: SiteRow[]
  page: number
  onPageChange: (page: number | ((page: number) => number)) => void
  totalPages: number
  isLoading: boolean
  isFetching: boolean
  hasAnySite: boolean
  toolbar?: ReactNode
}

export function SitesFranceCard({
  rows,
  allRows,
  page,
  onPageChange,
  totalPages,
  isLoading,
  isFetching,
  hasAnySite,
  toolbar,
}: SitesFranceCardProps) {
  const [mapExpanded, setMapExpanded] = useState(false)

  if (isLoading) return <SitesLoadingState />
  if (!hasAnySite) return null

  const plottable = allRows.filter(row => row.latitude != null && row.longitude != null)

  return (
    <Box className="space-y-4">
      <Box
        data-testid="sites-france-grid"
        display="grid"
        className={cn('gap-4 xl:grid-cols-[minmax(320px,0.56fr)_minmax(0,1fr)]', mapExpanded && 'xl:grid-cols-1')}
      >
        <FranceMapPanel
          rows={plottable}
          allRows={allRows}
          expanded={mapExpanded}
          onToggleExpanded={() => setMapExpanded(value => !value)}
        />
        {!mapExpanded ? (
          <SitesTable
            rows={rows}
            page={page}
            totalPages={totalPages}
            isFetching={isFetching}
            onPageChange={onPageChange}
            toolbar={toolbar}
          />
        ) : null}
      </Box>
      {/* #3451 — Louis, en recette : « mets le en dessous de la carte sur
          toute la largeur, je ne le veux plus sur cette ligne ». `SiteSidebar`
          vivait dans une 3e colonne de 320 px, à côté de la carte et du
          tableau — RETIRÉ de la grille, il suit maintenant en pleine largeur,
          sur la ligne du dessous. Muet pendant l'agrandissement de la carte
          (même règle que la table : rien qui distraie du plein écran). */}
      {!mapExpanded ? <SiteSidebar /> : null}
    </Box>
  )
}

function SitesLoadingState() {
  const { t } = useTranslation('accountSites')
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-[var(--bellum-text-secondary)]">
        <Loader2 className="size-4 animate-spin" />
        <Text element="span" size="sm">
          {t('loading.sites')}
        </Text>
      </div>
    </Card>
  )
}
