import { cn, Text } from '@bellum/ui'
import type { AnalysisGeoPerimeter, WorkspaceMarket } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { ScopeChipsField } from './ScopeChipsField'
import { SearchCountrySelector } from './SearchCountrySelector'

/**
 * Cadrage analyse (15/10) — « Où ? » : France (défaut) d'abord, puis Europe, Monde,
 * un pays, une région, une ville. « International » redisait « Monde » (même absence
 * de restriction, `matches_geo`) : retiré de l'écran, toujours lisible sur un run passé.
 */
const DISPLAYED_PERIMETERS: readonly AnalysisGeoPerimeter[] = ['france', 'europe', 'world', 'country', 'region', 'city']

const PERIMETER_LABEL_KEYS: Record<AnalysisGeoPerimeter, string> = {
  world: 'confirm.geo.perimeters.world',
  international: 'confirm.geo.perimeters.international',
  europe: 'confirm.geo.perimeters.europe',
  france: 'confirm.geo.perimeters.france',
  region: 'confirm.geo.perimeters.region',
  country: 'confirm.geo.perimeters.country',
  city: 'confirm.geo.perimeters.city',
}

/**
 * Périmètre géographique (#2163.9 « Monde », #2163.11 « Région »). `geo_perimeter`
 * et `geo_areas` étaient déclarés et testés côté contrat (`analysis.ts`,
 * `analysis.scope.test.ts`) sans AUCUN appelant web — le code mort exact que le
 * dépôt demande de chercher avant d'en écrire de nouveau.
 *
 * Le champ des zones n'apparaît que pour `region` : les trois autres valeurs
 * (France, Europe, International/Monde) ne se précisent pas par une liste de
 * noms libres.
 *
 * `country` (#2163.10 « Pays ») RÉUTILISE `SearchCountrySelector` — décision
 * Louis 17/09 : pas un second sélecteur pays, celui déjà câblé près du champ
 * entreprise change simplement de rôle sémantique ici (axe de périmètre de la
 * recherche, pas le country pack de la société ciblée). Le code choisi vit
 * dans `geoAreas[0]`, défaut `FR` (périmètre France par défaut côté produit).
 */
export function GeoPerimeterField({
  value,
  onChange,
  geoAreas,
  onGeoAreasChange,
  disabled = false,
}: {
  value: AnalysisGeoPerimeter | undefined
  onChange: (next: AnalysisGeoPerimeter) => void
  geoAreas: string[]
  onGeoAreasChange: (next: string[]) => void
  disabled?: boolean
}) {
  const { t } = useTranslation('search')
  return (
    <div className="flex flex-col gap-1.5">
      <Text size="xs" className="uppercase tracking-wide text-[var(--bellum-text-muted)]">
        {t('confirm.geo.label')}
      </Text>
      <div className="flex flex-wrap items-center gap-1.5">
        {DISPLAYED_PERIMETERS.map(perimeter => {
          const active = value === perimeter
          return (
            <button
              key={perimeter}
              type="button"
              onClick={() => onChange(perimeter)}
              aria-pressed={active}
              disabled={disabled}
              className={cn(
                'inline-flex min-h-6 items-center rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 pointer-coarse:min-h-11',
                active
                  ? 'border-[var(--bellum-primary-500)] bg-[var(--bellum-primary-500)] text-white'
                  : 'border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-[var(--bellum-text-secondary)] hover:bg-[var(--bellum-surface-1)] hover:text-[var(--bellum-text-primary)]',
              )}
            >
              {t(PERIMETER_LABEL_KEYS[perimeter])}
            </button>
          )
        })}
      </div>
      {value === 'region' || value === 'city' ? (
        <ScopeChipsField
          label={value === 'city' ? t('confirm.geo.citiesLabel') : t('confirm.geo.areasLabel')}
          placeholder={value === 'city' ? t('confirm.geo.citiesPlaceholder') : t('confirm.geo.areasPlaceholder')}
          values={geoAreas}
          onChange={onGeoAreasChange}
          removeLabel={area => t('confirm.focus.remove', { value: area })}
          disabled={disabled}
        />
      ) : null}
      {value === 'country' ? (
        <SearchCountrySelector
          value={(geoAreas[0] as WorkspaceMarket | undefined) ?? 'FR'}
          onChange={code => onGeoAreasChange([code])}
          disabled={disabled}
        />
      ) : null}
    </div>
  )
}
