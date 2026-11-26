import type { DiscoverCandidate } from './discover-types'

/** « VERSAILLES » → « Versailles » ; « SAINT-ÉTIENNE » → « Saint-Étienne ». */
function titleCity(city: string): string {
  return city
    .toLowerCase()
    .replace(/(^|[-' ])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase())
}

interface GeographyLine {
  /** Clé i18n (`discover` namespace). */
  key: 'card.geography.headquartersAndSites' | 'card.geography.headquartersInZone' | 'card.geography.sitesOnly'
  values: Record<string, string | number>
}

/**
 * #3983.1 (#3705.3) — la phrase qui DIT la base d'une géographie : « Siège à
 * Versailles (78) · 1 établissement dans la zone ». Posée sur la carte à côté de
 * la ville.
 *
 * `null` quand le registre ne prouve rien : on n'affiche pas ce qu'on n'a pas.
 * Aucun effectif local, aucune « équipe » : la source ne publie que la tranche
 * d'effectif de l'ENTREPRISE, jamais celle d'un site.
 */
export function candidateGeographyLine(geography: DiscoverCandidate['geography']): GeographyLine | null {
  if (!geography) return null
  const city = geography.headquarters.city ? titleCity(geography.headquarters.city) : null
  const department = geography.headquarters.department
  const hasHeadquarters = city !== null && department !== null
  if (geography.siteCount > 0) {
    return hasHeadquarters
      ? {
          key: 'card.geography.headquartersAndSites',
          values: { city, department, count: geography.siteCount },
        }
      : { key: 'card.geography.sitesOnly', values: { count: geography.siteCount } }
  }
  if (geography.basis === 'headquarters' && hasHeadquarters) {
    return { key: 'card.geography.headquartersInZone', values: { city, department } }
  }
  return null
}
