import { COMMUNES_DEPARTEMENTS } from '../geo/communes-departements.data.js'
import { normalizeCityName } from './geo-communes-normalize.js'

export { normalizeCityName }

/**
 * #4793.5 — commune → code(s) département. Table OFFICIELLE (`geo.api.gouv.fr`, COG), générée par
 * `scripts/generate-communes-departements.mjs`, jamais écrite à la main. Point d'entrée séparé
 * (`@bellum/contracts/geo-communes`) : hors de l'index, donc hors du bundle web.
 */

let index: Map<string, string[]> | null = null

function buildIndex(): Map<string, string[]> {
  const map = new Map<string, string[]>()
  // Départements triés : le résultat est déterministe (« Saint-Denis » ⇒ 93 puis 974).
  for (const dept of Object.keys(COMMUNES_DEPARTEMENTS).sort()) {
    for (const key of (COMMUNES_DEPARTEMENTS[dept] ?? '').split('|')) {
      const list = map.get(key)
      if (list) list.push(dept)
      else map.set(key, [dept])
    }
  }
  return map
}

/** TOUS les départements possibles pour ce nom de commune ; `[]` si inconnu. Jamais un seul deviné. */
export function departmentsOfCity(name: string): string[] {
  const key = normalizeCityName(name ?? '')
  if (!key) return []
  index ??= buildIndex()
  return [...(index.get(key) ?? [])]
}

const normalizeDepartmentCode = (code: string): string => {
  const c = code.trim().toUpperCase()
  return /^\d$/.test(c) ? `0${c}` : c
}

/** Vrai si l'un des départements possibles de la commune est dans `depts`. */
export function cityInDepartments(name: string, depts: readonly string[]): boolean {
  if (depts.length === 0) return false
  const wanted = new Set(depts.map(normalizeDepartmentCode))
  return departmentsOfCity(name).some(d => wanted.has(d))
}
