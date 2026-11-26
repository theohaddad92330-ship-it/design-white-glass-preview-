import { deaccentLower } from '@bellum/contracts'
import { knownCityCoordinates } from '@/lib/zones/commune-coordinates'
import { departmentFromPostalCode } from '@/features/accounts/lib/frenchDepartments'
import type { RawBranch, SiteRow } from './siteTypes'

// Region of the cities we already know the coordinates of. Lets a site sourced
// from the model (which carries no postal code) still land in a region, instead
// of counting as "région inconnue" and showing "Régions 0" beside a list of sites.
const CITY_REGIONS: Record<string, string> = {
  paris: 'Île-de-France',
  marseille: "Provence-Alpes-Côte d'Azur",
  lyon: 'Auvergne-Rhône-Alpes',
  toulouse: 'Occitanie',
  nice: "Provence-Alpes-Côte d'Azur",
  nantes: 'Pays de la Loire',
  strasbourg: 'Grand Est',
  montpellier: 'Occitanie',
  bordeaux: 'Nouvelle-Aquitaine',
  lille: 'Hauts-de-France',
  rennes: 'Bretagne',
  reims: 'Grand Est',
  grenoble: 'Auvergne-Rhône-Alpes',
  rouen: 'Normandie',
  caen: 'Normandie',
  nancy: 'Grand Est',
  pau: 'Nouvelle-Aquitaine',
  ajaccio: 'Corse',
  bastia: 'Corse',
}

// #4326.1 — le registre écrit « PARIS 8E ARRONDISSEMENT », « Paris 08 » ou « PARIS CEDEX 09 » pour ce que le dossier
// appelle « Paris » : sans ce rapprochement les établissements parisiens (et lyonnais, marseillais) ne partageaient
// ni ligne, ni coordonnées — Paris tombait de la carte et se noyait dans la liste.
const ARRONDISSEMENT_CITY = /^(paris|lyon|marseille)(?:[\s-]+\d{1,2}(?:e|er|eme)?)?(?:[\s-]*arrondissement)?$/
const CEDEX_SUFFIX = /\s+cedex(?:\s*\d+)?$/i

function titleCase(name: string): string {
  return name
    .toLowerCase()
    .replace(/(^|[\s\-'’])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase())
}

/** Le nom d'affichage d'une ville : sans CEDEX ni arrondissement (Paris/Lyon/Marseille), casse lisible si tout en majuscules. */
function displayCity(city: string): string {
  const trimmed = city.trim().replace(/\s+/g, ' ').replace(CEDEX_SUFFIX, '')
  const arrondissement = ARRONDISSEMENT_CITY.exec(deaccentLower(trimmed))
  const name = arrondissement ? (arrondissement[1] ?? trimmed) : trimmed
  return name === name.toUpperCase() ? titleCase(name) : arrondissement ? titleCase(name) : name
}

/** La clé de regroupement et de coordonnées : sans accent, casse ni ponctuation. */
function cityKey(city: string): string {
  return deaccentLower(displayCity(city))
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function coordsFor(city: string, rawLat: number | null, rawLng: number | null) {
  if (typeof rawLat === 'number' && typeof rawLng === 'number') return { latitude: rawLat, longitude: rawLng }
  // #5069 — le référentiel de TOUTES les communes (`commune-coordinates`), un seul endroit ; homonyme ou inconnue : rien.
  const fallback = knownCityCoordinates(displayCity(city))
  return fallback ? { latitude: fallback[0], longitude: fallback[1] } : { latitude: null, longitude: null }
}

function regionFromPostalCode(postal: string | null | undefined): string | null {
  // #3742 — référentiel complet (la Nièvre manquait) : `frenchDepartments.ts`.
  return departmentFromPostalCode(postal)?.region ?? null
}

/** Best-effort region for a site: what the source declared, else the department
 *  of its postal code, else the city when it is one we know. Stays ``null``
 *  when none of the three can establish it — a region is never guessed. */
function regionFor(declared: string | null, postal: string | null | undefined, city: string): string | null {
  return declared ?? regionFromPostalCode(postal) ?? CITY_REGIONS[cityKey(city)] ?? null
}

function isNoiseCity(city: string): boolean {
  const lower = city.toLowerCase()
  return (
    lower.includes('non identifié') ||
    lower.includes('non identifie') ||
    lower.includes('inconnu') ||
    lower === 'n/a' ||
    lower === '-'
  )
}

export function normaliseBranches(branches: unknown[]): SiteRow[] {
  return branches.flatMap(branch => {
    if (typeof branch !== 'object' || branch === null) return []
    const raw = branch as RawBranch
    const city = displayCity(raw.city ?? '')
    if (!city) return []
    const coordinates = coordsFor(city, raw.latitude ?? null, raw.longitude ?? null)
    return [
      {
        city,
        region: regionFor(null, raw.postal_code, city),
        type: raw.is_headquarters ? 'siège' : 'établissement',
        priority: raw.is_headquarters ? 'haute' : 'moyenne',
        ...coordinates,
        is_headquarters: Boolean(raw.is_headquarters),
        source: 'registry',
        establishments: 1,
      },
    ]
  })
}

export function normaliseClaudeSites(claudeSites: unknown): SiteRow[] {
  if (!Array.isArray(claudeSites)) return []
  return claudeSites.flatMap(site => {
    if (typeof site !== 'object' || site === null) return []
    const raw = site as Record<string, unknown>
    const rawCity = typeof raw['city'] === 'string' ? raw['city'] : typeof raw['ville'] === 'string' ? raw['ville'] : ''
    if (!rawCity || isNoiseCity(rawCity)) return []
    const city = displayCity(rawCity)
    const coordinates = coordsFor(
      city,
      typeof raw['latitude'] === 'number' ? raw['latitude'] : null,
      typeof raw['longitude'] === 'number' ? raw['longitude'] : null,
    )
    const priority =
      typeof raw['priority'] === 'string'
        ? raw['priority']
        : typeof raw['importance'] === 'string'
          ? raw['importance']
          : null
    // #4326 — le registre officiel (Sirene) ne porte le code postal que dans
    // `notes` (« CP 35000 · source officielle ») : on le lit, la région s'en déduit.
    const postal =
      typeof raw['postal_code'] === 'string'
        ? raw['postal_code']
        : typeof raw['notes'] === 'string'
          ? (/\bCP\s*(\d{5})\b/.exec(raw['notes'])?.[1] ?? null)
          : null
    return [
      {
        city,
        region: regionFor(typeof raw['region'] === 'string' ? raw['region'] : null, postal, city),
        type: typeof raw['type'] === 'string' ? raw['type'] : null,
        priority,
        ...coordinates,
        // #2966 (#2119.57) — une présence lue par le modèle (jamais le
        // registre légal) ne devient JAMAIS un établissement officiel, quoi
        // que le modèle ait écrit dans `type` (« siège » inclus).
        is_headquarters: false,
        source: 'inferred',
      },
    ]
  })
}

/** Union of both sources, keyed by city. A site known only to the model is KEPT
 *  (it used to be dropped, which emptied the table while the header still counted
 *  it); a site known to both is enriched with the model's type / priority. */
export function mergeRows(pappers: SiteRow[], claude: SiteRow[]): SiteRow[] {
  // #4326 — une ville peut porter plusieurs établissements (Paris ×5) : on les
  // regroupe en UNE ligne qui GARDE leur nombre, jamais une troncature à une
  // ligne par ville. Le siège l'emporte sur les établissements de la ville.
  const byCity = new Map<string, SiteRow>()
  pappers.forEach(row => {
    const key = cityKey(row.city)
    const existing = byCity.get(key)
    if (!existing) return void byCity.set(key, row)
    const winner = row.is_headquarters && !existing.is_headquarters ? row : existing
    byCity.set(key, {
      ...winner,
      region: winner.region ?? existing.region ?? row.region,
      establishments: (existing.establishments ?? 1) + (row.establishments ?? 1),
    })
  })
  claude.forEach(row => {
    const key = cityKey(row.city)
    const existing = byCity.get(key)
    byCity.set(
      key,
      existing
        ? {
            ...existing,
            region: existing.region ?? row.region,
            type: row.type ?? existing.type,
            priority: row.priority ?? existing.priority,
          }
        : row,
    )
  })
  return Array.from(byCity.values())
}

/** #4326 — le vrai total : chaque établissement du registre compte, une ligne
 *  du modèle pour une ville inconnue du registre compte pour un site. */
export function countSites(rows: SiteRow[]): number {
  return rows.reduce((sum, row) => sum + (row.establishments ?? 1), 0)
}

/** #4326.1 — les SITES (établissements) qu'aucune coordonnée ne place sur la carte : listés, jamais perdus, et dits. */
export function countUnplottedSites(rows: SiteRow[]): number {
  return countSites(rows.filter(row => row.latitude == null || row.longitude == null))
}

/** #4326.1 — la liste se pagine par VILLE (après regroupement), jamais par établissement brut : une ville tardive
 *  dans l'ordre du registre (Paris, Bordeaux) reste atteignable, et aucune page ne la coupe en deux. */
export function pageOfCities(rows: SiteRow[], page: number, size: number): { rows: SiteRow[]; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / size))
  const current = Math.min(Math.max(1, page), totalPages)
  return { rows: rows.slice((current - 1) * size, current * size), totalPages }
}
