import { Button, Text, Tooltip, TooltipContent, TooltipTrigger, cn } from '@bellum/ui'
import { geoMercator, geoPath, type GeoProjection } from 'd3-geo'
import { select } from 'd3-selection'
import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
import { Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { i18n } from '@/i18n'
import { SITE_CATEGORY_STYLES, siteCategory } from './siteStyles'
import type { SiteRow } from './siteTypes'

type FranceFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry>
type FranceGeoJson = FranceFeatureCollection | GeoJSON.Feature<GeoJSON.Geometry>

type D3FranceMapProps = {
  rows: SiteRow[]
  expanded: boolean
}

const VIEW = { width: 720, height: 760 }
const FRANCE_GEO_URL = '/maps/france-metropole.geojson'

export function D3FranceMap({ rows, expanded }: D3FranceMapProps) {
  const { t } = useTranslation('accountSites')
  const svgRef = useRef<SVGSVGElement | null>(null)
  const contentRef = useRef<SVGGElement | null>(null)
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)
  const [geoData, setGeoData] = useState<FranceFeatureCollection | null>(null)
  const [transform, setTransform] = useState<ZoomTransform>(zoomIdentity)

  useEffect(() => {
    let cancelled = false
    fetch(FRANCE_GEO_URL)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<FranceGeoJson>
      })
      .then(data => {
        if (!cancelled) setGeoData(toFeatureCollection(data))
      })
      .catch(error => console.error('Unable to load France GeoJSON', error))
    return () => {
      cancelled = true
    }
  }, [])

  const projection = useMemo(() => {
    if (!geoData) return null
    return geoMercator().fitExtent(
      [
        [36, 36],
        [VIEW.width - 36, VIEW.height - 36],
      ],
      geoData,
    )
  }, [geoData])

  const path = useMemo(() => (projection ? geoPath(projection) : null), [projection])

  useEffect(() => {
    if (!svgRef.current || !contentRef.current) return
    const svgNode = svgRef.current
    const content = select(contentRef.current)
    const zoomBehaviour = zoom<SVGSVGElement, unknown>()
      .scaleExtent([1, 8])
      .translateExtent([
        [-VIEW.width * 0.5, -VIEW.height * 0.5],
        [VIEW.width * 1.5, VIEW.height * 1.5],
      ])
      .on('zoom', event => {
        setTransform(event.transform)
        content.attr('transform', event.transform.toString())
      })

    select(svgNode).call(zoomBehaviour)
    zoomRef.current = zoomBehaviour
    return () => {
      select(svgNode).on('.zoom', null)
    }
    // `geoData` — et non `[]` : `svgRef`/`contentRef` ne sont posées qu'au
    // rendu où `geoData` est déjà chargé (avant ça, la ligne 88 rend
    // `MapLoadingState`, un arbre sans `<svg>`). Avec un tableau de
    // dépendances vide, cet effet ne s'exécutait qu'une fois, juste après ce
    // tout premier rendu — sur des refs encore `null` — et le garde-fou
    // `if (!svgRef.current...) return` sortait en silence sans jamais poser
    // `zoomRef.current`. L'effet ne se relançait ensuite plus jamais : une
    // fois la vraie carte montée, `zoomBehaviour` n'était plus attaché à
    // rien — molette, glisser-déposer et les boutons +/- ne faisaient plus
    // rien (#2612). Dépendre de `geoData` fait rejouer l'attachement dès que
    // les refs existent pour de vrai.
  }, [geoData])

  const zoomBy = useCallback((factor: number) => {
    if (!svgRef.current || !zoomRef.current) return
    select(svgRef.current).call(zoomRef.current.scaleBy, factor)
  }, [])

  if (!geoData || !path || !projection) return <MapLoadingState />

  return (
    <div className="relative flex h-full min-h-0 w-full items-center justify-center">
      <MapZoomControls onZoomIn={() => zoomBy(1.35)} onZoomOut={() => zoomBy(1 / 1.35)} />
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
        className={cn(
          'relative h-full min-h-[520px] w-full cursor-grab active:cursor-grabbing',
          expanded && 'min-h-[600px] max-w-[760px]',
        )}
        role="img"
        aria-label={t('map.ariaLabel')}
      >
        <defs>
          <filter id="france-map-shadow" x="-15%" y="-15%" width="130%" height="130%">
            <feDropShadow dx="0" dy="10" stdDeviation="12" floodColor="currentColor" floodOpacity="0.12" />
          </filter>
        </defs>
        <g ref={contentRef}>
          <FranceFeatures geoData={geoData} path={path} transform={transform} />
          <SiteMarkers rows={rows} projection={projection} transform={transform} />
        </g>
      </svg>
    </div>
  )
}

function toFeatureCollection(data: FranceGeoJson): FranceFeatureCollection {
  if (data.type === 'FeatureCollection') return data
  return {
    type: 'FeatureCollection',
    features: [data],
  }
}

function MapZoomControls({ onZoomIn, onZoomOut }: { onZoomIn: () => void; onZoomOut: () => void }) {
  const { t } = useTranslation('accountSites')
  return (
    <div className="absolute right-3 bottom-3 z-10 flex flex-col overflow-hidden rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg)] shadow-sm">
      <MapZoomButton label={t('map.zoomIn')} onClick={onZoomIn}>
        <Plus className="size-4" />
      </MapZoomButton>
      <div className="h-px bg-[var(--bellum-border)]" />
      <MapZoomButton label={t('map.zoomOut')} onClick={onZoomOut}>
        <Minus className="size-4" />
      </MapZoomButton>
    </div>
  )
}

function MapZoomButton({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="size-7 rounded-none text-[var(--bellum-text-primary)] hover:bg-[var(--bellum-bg-lighter)]"
    >
      {children}
    </Button>
  )
}

function MapLoadingState() {
  const { t } = useTranslation('accountSites')
  return (
    <div className="flex h-[520px] items-center justify-center text-sm text-[var(--bellum-text-secondary)]">
      {t('map.loading')}
    </div>
  )
}

function FranceFeatures({
  geoData,
  path,
  transform,
}: {
  geoData: FranceFeatureCollection
  path: ReturnType<typeof geoPath>
  transform: ZoomTransform
}) {
  const shapeClass =
    'fill-[color-mix(in_srgb,var(--bellum-text-primary)_7%,var(--bellum-bg))] stroke-[var(--bellum-border)] dark:fill-[color-mix(in_srgb,var(--bellum-primary-500)_9%,var(--bellum-bg-lighter))] dark:stroke-[var(--bellum-border-strong)]'

  return (
    <g filter="url(#france-map-shadow)">
      {geoData.features.map((feature, index) => (
        <path
          key={index}
          d={path(feature) ?? undefined}
          className={shapeClass}
          strokeWidth={Math.max(0.35, 1.2 / transform.k)}
        />
      ))}
    </g>
  )
}

function SiteMarkers({
  rows,
  projection,
  transform,
}: {
  rows: SiteRow[]
  projection: GeoProjection
  transform: ZoomTransform
}) {
  return rows.map((row, index) => {
    if (row.latitude == null || row.longitude == null) return null
    const point = projection([row.longitude, row.latitude])
    if (!point) return null
    return <SiteMarker key={`${row.city}-${index}`} row={row} point={point} transform={transform} />
  })
}

function SiteMarker({ row, point, transform }: { row: SiteRow; point: [number, number]; transform: ZoomTransform }) {
  const [x, y] = point
  const style = SITE_CATEGORY_STYLES[siteCategory(row)]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <g
          transform={`translate(${x}, ${y})`}
          className="cursor-pointer outline-none"
          tabIndex={0}
          role="button"
          aria-label={siteTooltipTitle(row)}
        >
          <circle r={(row.is_headquarters ? 12 : 8) / transform.k} className={style.marker} opacity="0.16" />
          <circle
            r={(row.is_headquarters ? 5.5 : 4) / transform.k}
            className={style.marker}
            stroke="var(--bellum-bg)"
            strokeWidth={2 / transform.k}
          />
        </g>
      </TooltipTrigger>
      <TooltipContent side="top" align="center">
        <SiteTooltipContent row={row} />
      </TooltipContent>
    </Tooltip>
  )
}

function SiteTooltipContent({ row }: { row: SiteRow }) {
  return (
    <div className="min-w-40 text-left">
      <Text size="sm">{siteTooltipTitle(row)}</Text>
      <Text className="mt-1 space-y-0.5">
        {row.region ? <Text size="xs">{row.region}</Text> : null}
        {row.type ? <Text size="xs">{row.type}</Text> : null}
        {/* #2966 (#2119.57) — la carte dit la MÊME chose que la liste : une
            présence inférée ne se lit jamais comme un établissement officiel. */}
        {row.source === 'inferred' ? (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {i18n.t('accountSites:table.inferred')}
          </Text>
        ) : null}
      </Text>
    </div>
  )
}

function siteTooltipTitle(row: SiteRow) {
  return row.city || i18n.t('accountSites:map.siteFallback')
}
