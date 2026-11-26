import { COMMUNES_COORDONNEES } from '../geo/communes-coordonnees.data.js'
import { normalizeCityName } from './geo-communes-normalize.js'

/**
 * #5069 — coordonnées d'une commune française. Table OFFICIELLE (COG INSEE + contours IGN), générée par
 * `scripts/generate-communes-coordonnees.mjs`, jamais écrite à la main. Point d'entrée séparé
 * (`@bellum/contracts/geo-coordinates`) : hors de l'index, donc hors du bundle web — l'écran l'importe à la demande.
 */

export type CommuneCoordinates = readonly [latitude: number, longitude: number]

type Entry = { department: string; point: CommuneCoordinates; homonym: boolean }

let index: Map<string, Entry[]> | null = null

function buildIndex(): Map<string, Entry[]> {
  const map = new Map<string, Entry[]>()
  for (const department of Object.keys(COMMUNES_COORDONNEES).sort()) {
    for (const raw of (COMMUNES_COORDONNEES[department] ?? '').split(';')) {
      const [name, lat, lon, flag] = raw.split('|')
      if (!name || lat === undefined || lon === undefined) continue
      const entry: Entry = { department, point: [Number(lat), Number(lon)], homonym: flag === 'h' }
      const list = map.get(name)
      if (list) list.push(entry)
      else map.set(name, [entry])
    }
  }
  return map
}

const normalizeDepartmentCode = (code: string): string => {
  const c = code.trim().toUpperCase()
  return /^\d$/.test(c) ? `0${c}` : c
}

/**
 * Le point d'une commune, ou `null` : inconnue du référentiel, OU homonyme qu'aucun département ne départage
 * (« Saint-Denis » sans département), OU département donné qui ne correspond pas. Jamais une coordonnée devinée.
 */
export function communeCoordinates(name: string, department?: string | null): CommuneCoordinates | null {
  const key = normalizeCityName(name ?? '')
  if (!key) return null
  index ??= buildIndex()
  const entries = index.get(key)
  if (!entries) return null
  const wanted = department?.trim() ? normalizeDepartmentCode(department) : null
  if (wanted) return entries.find(entry => entry.department === wanted)?.point ?? null
  const [only] = entries
  return entries.length === 1 && only && !only.homonym ? only.point : null
}
