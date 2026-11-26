import { useSyncExternalStore } from 'react'
import { offerTargetRegionCodes } from '@/features/discover/lib/discover-offer-territory'
import { ZONE_DEPARTMENTS } from './zone-referential.data'

/**
 * Lot 772 — UN lieu écrit (« Villeurbanne/Lyon », « 59000 Lille », « Paris », « Lille (59) ») → ses régions INSEE.
 * L'unique lecture web lieu → région (GA-26), dans cet ordre et sans jamais deviner :
 *  1. les régions et métropoles que Découvrir sait déjà lire (`offerTargetRegionCodes`) ;
 *  2. un code postal ou un département entre parenthèses ;
 *  3. le nom d'une COMMUNE, dans le référentiel officiel (COG) — chargé À LA DEMANDE (chunk séparé, comme
 *     `commune-coordinates`). Une commune dont les homonymes tombent dans plusieurs régions n'a AUCUNE région.
 * Tant que le référentiel n'est pas chargé, les étapes 1 et 2 répondent seules : « inconnu », jamais une région devinée.
 */

type DepartmentsOfCity = (name: string) => string[]

let departmentsOfCity: DepartmentsOfCity | null = null
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

export function loadPlaceRegions(): Promise<void> {
  loading ??= import('@bellum/contracts/geo-communes').then(
    module => {
      departmentsOfCity = module.departmentsOfCity
      listeners.forEach(listener => listener())
    },
    () => {
      loading = null // un échec de chargement se retente au prochain appel
    },
  )
  return loading
}

/** Vrai quand le référentiel des communes est chargé (déclenche le chargement au premier appel). */
export function usePlaceRegionsReady(): boolean {
  return useSyncExternalStore(
    onChange => {
      void loadPlaceRegions()
      listeners.add(onChange)
      return () => void listeners.delete(onChange)
    },
    () => departmentsOfCity !== null,
    () => false,
  )
}

const REGION_OF_DEPARTMENT: ReadonlyMap<string, string> = new Map(
  ZONE_DEPARTMENTS.map(([code, , region]) => [code, region]),
)

const unique = (values: readonly string[]): string[] => [...new Set(values)]

const regionOfDepartment = (code: string): string[] => {
  const region = REGION_OF_DEPARTMENT.get(code)
  return region ? [region] : []
}

/** Le département d'un code postal (« 59000 » → 59, « 97400 » → 974) ou d'un « (59) » ; `null` sinon. */
function departmentCodeOf(text: string): string | null {
  const postal = /(?:^|\D)(\d{5})(?!\d)/.exec(text)
  if (postal) {
    const code = postal[1]!.startsWith('97') ? postal[1]!.slice(0, 3) : postal[1]!.slice(0, 2)
    if (REGION_OF_DEPARTMENT.has(code)) return code
  }
  const bracket = /\(\s*(\d{2,3}|2[AB])\s*\)/i.exec(text)
  if (bracket) {
    const code = bracket[1]!.toUpperCase()
    if (REGION_OF_DEPARTMENT.has(code)) return code
  }
  return null
}

const SEGMENT_SPLIT = /[,;/()|]+|\s+-\s+|\s+(?:et|and|à|a|près de|pres de|proche de)\s+/i

/** Les régions d'un lieu écrit ; `[]` = non lu (jamais « toute la France », jamais une région devinée). */
export function regionCodesOfPlace(place: string | null | undefined): string[] {
  const text = (place ?? '').trim()
  if (text === '') return []
  const known = offerTargetRegionCodes(text)
  if (known.length > 0) return known
  const department = departmentCodeOf(text)
  if (department) return regionOfDepartment(department)
  if (!departmentsOfCity) return []
  const regions: string[] = []
  for (const segment of [text, ...text.split(SEGMENT_SPLIT)]) {
    const name = segment.trim().replace(/^(?:à|a)\s+/i, '')
    if (name.length < 3) continue
    const own = unique((departmentsOfCity(name) ?? []).flatMap(regionOfDepartment))
    // Un homonyme qui traverse des régions ne dit pas où : aucune région plutôt qu'une région devinée.
    if (own.length === 1) regions.push(own[0]!)
  }
  return unique(regions)
}

/** « … à Villeurbanne/Lyon. » → « Villeurbanne/Lyon » : le lieu qu'un intitulé reformulé porte, ou `null`. */
export function placeOfTitle(title: string | null | undefined): string | null {
  const match =
    /(?:^|\s)à\s+((?:\p{Lu}[\p{L}'’-]*)(?:[ -]\p{Lu}[\p{L}'’-]*)*(?:\s*\/\s*\p{Lu}[\p{L}'’-]*(?:[ -]\p{Lu}[\p{L}'’-]*)*)*)/u.exec(
      title ?? '',
    )
  return match ? match[1]!.trim() : null
}
