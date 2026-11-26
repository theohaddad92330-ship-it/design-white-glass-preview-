import type { AnalysisGeoPerimeter, AnalysisScopeSelection, DiscoverOriginCriteria } from '@bellum/contracts'
import { cadrageFromLegacyScopeMode, geoScopeFromOriginCriteria } from '@bellum/contracts'

/**
 * Le cadrage d'ouverture de l'écran « Cadrer » (cadrage analyse 15/10).
 *
 * L'écran 1 n'a plus de rangée « Périmètre » : ce qui en arrive encore — un
 * ancien lien `/search?scope=…`, le périmètre mémorisé de l'utilisateur
 * (#4161) — se MIGRE vers la question « Où ? » par la seule table du contrat
 * (`cadrageFromLegacyScopeMode`). Ordre : la zone d'une relance (#3742,
 * `geo`/`geoAreas`) > l'URL > la mémoire > rien (France posée par l'écran).
 */
export function initialCadrage({
  scope,
  remembered,
  geo,
  geoAreas,
  zone,
  searched,
}: {
  scope?: string | null
  remembered?: string | null
  geo?: AnalysisGeoPerimeter
  geoAreas?: string[]
  /** #4432.2 — la zone de l'URL (`/search?zone=Occitanie`), posée par Découvrir et les cartes de Laura. */
  zone?: string
  /** #4432.3 — les critères de la recherche Découvrir d'où vient « Analyser ». */
  searched?: DiscoverOriginCriteria
}): AnalysisScopeSelection {
  if (geo) return { geo_perimeter: geo, ...(geoAreas?.length ? { geo_areas: geoAreas } : {}) }
  // #4432.2 — la zone de l'URL devient le périmètre présélectionné (cas général, pas seulement le siège hors zone).
  const urlZone = zone?.trim()
  if (urlZone) return { geo_perimeter: 'region', geo_areas: [urlZone] }
  // #4432.3 — la zone cherchée devient le périmètre, prérempli et modifiable dans « Où ? ».
  const fromSearch = geoScopeFromOriginCriteria(searched)
  if (fromSearch) return fromSearch
  const fromUrl = cadrageFromLegacyScopeMode(scope)
  if (fromUrl.geo_perimeter) return fromUrl
  const fromMemory = cadrageFromLegacyScopeMode(remembered)
  if (fromMemory.geo_perimeter) return fromMemory
  // Rien de dit : l'écran « Cadrer » pose France (`DEFAULT_CADRAGE_GEO`) quand le
  // marché est la France, et aucun défaut restrictif ailleurs (#3742).
  return {}
}

const ENTITY_NAME_KEYS = ['name', 'entity', 'label', 'companyName', 'denomination'] as const
const MAX_KNOWN_ENTITIES = 30

/**
 * Les entités DÉJÀ connues du dossier (relance) — l'autocomplétion du champ
 * « entités à cibler / à exclure ». Une société jamais analysée n'en a aucune :
 * on ne propose pas d'entités inventées avant la phase 1 (#1110).
 */
export function knownEntityNames(
  account: { subsidiaries?: readonly unknown[]; raw_analysis?: Record<string, unknown> | null } | null | undefined,
): string[] {
  if (!account) return []
  const raw = account.raw_analysis?.['subsidiaries']
  const items = [...(account.subsidiaries ?? []), ...(Array.isArray(raw) ? raw : [])]
  const names: string[] = []
  for (const item of items) {
    const name =
      typeof item === 'string'
        ? item
        : item && typeof item === 'object'
          ? ENTITY_NAME_KEYS.map(key => (item as Record<string, unknown>)[key]).find(
              (value): value is string => typeof value === 'string',
            )
          : undefined
    const trimmed = name?.trim()
    if (trimmed && !names.includes(trimmed)) names.push(trimmed)
    if (names.length >= MAX_KNOWN_ENTITIES) break
  }
  return names
}
