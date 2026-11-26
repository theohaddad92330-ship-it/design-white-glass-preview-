import { completePlace } from './discover-other-actors'
import type { DiscoverCandidate } from './discover-types'

/**
 * #3238 (recette prod 02/10) — « seul Lille · 59, 0 siteCity » : la ville du
 * SITE qui a publié une offre n'était lisible qu'en dépliant les signaux. Elle
 * remonte sur l'en-tête de la carte, à côté de la ville du siège.
 *
 * Seules les villes EXPLICITEMENT affichées par la source (`siteCity`) : jamais
 * déduites, jamais celle du groupe. Une ville identique au siège ne fait pas
 * une seconde ligne ; une absence ne fait aucune puce.
 */
export function candidateSiteCities(
  candidate: Pick<DiscoverCandidate, 'city' | 'signals'> & Partial<Pick<DiscoverCandidate, 'skillEvidence'>>,
): string[] {
  const headquarters = (candidate.city ?? '').trim().toLowerCase()
  const seen = new Set<string>()
  const cities: string[] = []
  // Lot DÉCOUVRIR-MOTEUR (27/10, #4515 / #4419) — en recherche par compétence, le lieu filtre sur le LIEU DE TRAVAIL
  // de l'offre, jamais le siège : la ville de l'offre qui a prouvé la compétence se dit à côté du siège (mesure prod :
  // « Boulogne-Billancourt » sous ?city=Lille, sans rien qui dise que l'offre est à Lille).
  const offerCity = offerPlace(candidate.skillEvidence?.latestOffer.city)
  // #4419.5 / #4814 (lot Q) — un lieu coupé par la source (« Lille, Hauts-de- ») se complète ICI aussi, pas seulement
  // dans les tableaux : la ligne « Sites : » de la carte l'affichait tel quel (recette prod 01/11, 6/21 tronqués).
  for (const raw of [...candidate.signals.map(signal => (signal.siteCity ?? '').trim()), offerCity]) {
    const city = completePlace(raw) ?? ''
    const key = city.toLowerCase()
    if (!city || key === headquarters || seen.has(key)) continue
    seen.add(key)
    cities.push(city)
  }
  return cities
}

/** « 59 - LILLE » (libellé de la source) → « Lille » ; une ville absente reste vide (jamais devinée). */
function offerPlace(raw: string | null | undefined): string {
  const city = (raw ?? '').replace(/^\s*\d{2,3}\s*-\s*/, '').trim()
  if (!city || city !== city.toUpperCase()) return city
  return city
    .toLowerCase()
    .replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase())
}
