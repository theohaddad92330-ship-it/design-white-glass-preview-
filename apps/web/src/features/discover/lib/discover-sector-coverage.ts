/**
 * #4358.3 — « un secteur sans donnée suffisante le DIT ». Deux lectures, mesurées sur la liste reçue (jamais
 * devinées) et seulement quand un secteur est réellement cherché :
 *
 * - `thin` : peu d'entreprises pour ce secteur ;
 * - `naf` : le code NAF n'est connu que pour une minorité — le secteur n'a pu être vérifié que sur celles-là.
 *
 * Sous `DISCOVER_INCOMPLETE_SEARCH_THRESHOLD` la notice « recherche incomplète » parle déjà : pas de seconde
 * voix (GA-26). Les seuils vivent ici, à UN seul endroit.
 */
import { DISCOVER_INCOMPLETE_SEARCH_THRESHOLD } from './discover-incomplete-search'

export const DISCOVER_SECTOR_THIN_THRESHOLD = 8
const NAF_WEAK_SHARE = 0.5

export type SectorCoverageReading = { kind: 'thin'; count: number } | { kind: 'naf'; known: number; total: number }

export function sectorCoverageReading(
  sectors: readonly string[] | undefined,
  candidates: readonly { nafCode: string | null }[],
): SectorCoverageReading | null {
  if (!sectors || sectors.length === 0) return null
  const total = candidates.length
  if (total < DISCOVER_INCOMPLETE_SEARCH_THRESHOLD) return null
  const known = candidates.filter(c => typeof c.nafCode === 'string' && c.nafCode.trim() !== '').length
  if (known / total < NAF_WEAK_SHARE) return { kind: 'naf', known, total }
  if (total < DISCOVER_SECTOR_THIN_THRESHOLD) return { kind: 'thin', count: total }
  return null
}
